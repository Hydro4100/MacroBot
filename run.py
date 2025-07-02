import webview
import os
import base64
import pyautogui
import json
import time
import threading
from pynput import keyboard

# --- Application Version ---
APP_VERSION = "0.1.0"

# --- Global State for Macro Execution ---
macro_runner_thread = None
hotkey_manager = None
user_settings = {}

# --- Helper function to get a file path ---
def get_path(relative_path, user_data=False):
    """ Get absolute path to resource, works for dev and for user data. """
    if user_data:
        # Use a consistent user data directory
        app_data_dir = os.path.join(os.path.expanduser("~"), ".MacroBot")
        if not os.path.exists(app_data_dir):
            os.makedirs(app_data_dir)
        return os.path.join(app_data_dir, relative_path)
    
    # Path for frontend files
    return os.path.join(os.path.dirname(__file__), "frontend", relative_path)

# --- Settings Management ---
def load_user_settings():
    """ Loads user settings from a json file. """
    global user_settings
    settings_path = get_path("settings.json", user_data=True)
    if os.path.exists(settings_path):
        with open(settings_path, 'r') as f:
            user_settings = json.load(f)
    else:
        # Default settings for a new user
        user_settings = {"last_seen_version": "0.0.0"}

def save_user_settings():
    """ Saves user settings to a json file. """
    settings_path = get_path("settings.json", user_data=True)
    with open(settings_path, 'w') as f:
        json.dump(user_settings, f, indent=4)

# --- Macro Execution Engine ---
class MacroRunner:
    def __init__(self, macro_data, window):
        self.macro_data = macro_data
        self.window = window
        self.is_running = False
        self.nodes = {node['id']: node for node in macro_data['nodes']}
        self.connections = macro_data['connections']

    def stop(self):
        self.is_running = False
        self.window.evaluate_js('window.clearNodeHighlights()')
        print("Macro execution stopped by user.")

    def run(self):
        self.is_running = True
        print("Starting macro execution...")
        self.window.evaluate_js('window.clearNodeHighlights()')
        
        start_node_id = self.macro_data.get('start_node_id')
        if not start_node_id:
            print("Error: No start_node_id provided.")
            self.window.evaluate_js('window.clearNodeHighlights()')
            return

        current_node_id = start_node_id
        try:
            while current_node_id and self.is_running:
                node = self.nodes.get(current_node_id)
                if not node:
                    print(f"Error: Node {current_node_id} not found.")
                    break

                # Highlight the current node on the frontend
                self.window.evaluate_js(f"window.highlightNode('{current_node_id}')")
                next_pin_name = self.execute_node(node)

                # A small delay to make the highlight visible on very fast nodes
                time.sleep(0.05)

                if not self.is_running:
                    break

                next_connection = next((c for c in self.connections if c['startNodeId'] == current_node_id and c['startPinName'] == next_pin_name and c['flow'] == 'exec'), None)
                
                if next_connection:
                    current_node_id = next_connection['endNodeId']
                else:
                    current_node_id = None
        finally:
            print("Macro execution finished.")
            # Clear highlights when the macro finishes or is stopped
            self.window.evaluate_js('window.clearNodeHighlights()')
            global macro_runner_thread
            macro_runner_thread = None


    def execute_node(self, node):
        node_type = node.get('type')
        values = node.get('values', {})
        print(f"Executing node: {node.get('id')} ({node_type})")
        
        next_exec_pin = 'exec'

        try:
            if not self.is_running: return None

            if node_type == 'delay':
                duration = float(values.get('Duration', 1))
                unit = values.get('Unit', 'seconds')
                if unit == 'milliseconds':
                    duration /= 1000.0
                elif unit == 'minutes':
                    duration *= 60
                
                end_time = time.time() + duration
                while time.time() < end_time and self.is_running:
                    time.sleep(0.1)

            elif node_type == 'mouse_click':
                pyautogui.click(
                    button=values.get('Button', 'left').lower(),
                    clicks=2 if values.get('Action') == 'double_click' else 1,
                    interval=0.1
                )

            elif node_type == 'mouse_move':
                duration = float(values.get('Duration', 0.25))
                unit = values.get('Unit', 'seconds')
                if unit == 'milliseconds':
                    duration /= 1000.0
                
                pyautogui.moveTo(
                    x=int(values.get('X', 0)),
                    y=int(values.get('Y', 0)),
                    duration=duration
                )
            
            elif node_type == 'key_press':
                key_info = values.get('Key', {})
                pynput_str = key_info.get('pynput', '')
                if not pynput_str:
                    return next_exec_pin

                # Simple key press, not a combination
                if '+' not in pynput_str:
                    # It might be a special key like '<enter>' or a normal key 'a'
                    key_to_press = pynput_str.replace('<', '').replace('>', '')
                    pyautogui.press(key_to_press)
                else:
                    # It's a combination like '<ctrl>+s'
                    # PyAutoGUI's hotkey function takes separate args
                    keys = pynput_str.replace('<', '').replace('>', '').split('+')
                    pyautogui.hotkey(*keys)
            
            elif node_type == 'type_string':
                text_to_type = values.get('Text', '')
                delay = float(values.get('Delay', 50))
                unit = values.get('Unit', 'milliseconds')
                if unit == 'milliseconds':
                    delay /= 1000.0
                
                pyautogui.typewrite(text_to_type, interval=delay)


        except Exception as e:
            print(f"Error executing node {node.get('id')}: {e}")
            self.stop()

        return next_exec_pin


# --- Hotkey Management ---
class HotkeyManager:
    def __init__(self, window):
        self.window = window
        self.listener = None
        self.lock = threading.Lock()

    def update_and_restart_listener(self, hotkey_config):
        with self.lock:
            if self.listener:
                self.listener.stop()

            hotkeys_to_listen = {}
            for hotkey_str, action in hotkey_config.items():
                def on_activate(act=action):
                    if act == 'emergency_stop':
                        global macro_runner_thread
                        if macro_runner_thread and macro_runner_thread.is_running:
                            macro_runner_thread.stop()
                            print("Emergency stop activated.")
                    else:
                        js_code = f"window.triggerMacroByHotkey('{act}')"
                        self.window.evaluate_js(js_code)
                
                hotkeys_to_listen[hotkey_str] = on_activate
            
            if hotkeys_to_listen:
                self.listener = keyboard.GlobalHotKeys(hotkeys_to_listen)
                self.listener.start()
                print(f"Hotkey listener started with: {list(hotkeys_to_listen.keys())}")
            else:
                self.listener = None
                print("No hotkeys to listen for. Listener stopped.")


# --- Main Application Window ---
class Api:
    def get_app_version(self):
        """ Returns the current application version. """
        return APP_VERSION

    def get_user_settings(self):
        """ Returns the loaded user settings to the frontend. """
        return user_settings

    def save_user_settings(self, settings):
        """ Receives settings from JS and saves them. """
        global user_settings
        user_settings = settings
        save_user_settings()
        return {'success': True}

    def open_load_dialog(self):
        window = webview.windows[0]
        result = window.create_file_dialog(webview.OPEN_DIALOG, allow_multiple=False, file_types=('Macro Files (*.macro;*.json)', 'All files (*.*)'))
        return result[0] if result else None

    def open_save_dialog(self):
        window = webview.windows[0]
        result = window.create_file_dialog(webview.SAVE_DIALOG, allow_multiple=False, file_types=('Macro Files (*.macro)',), save_filename='my-macro.macro')
        return result if result else None

    def open_image_dialog(self):
        window = webview.windows[0]
        result = window.create_file_dialog(webview.OPEN_DIALOG, allow_multiple=False, file_types=('Image Files (*.png;*.jpg;*.jpeg)',))
        return result[0] if result else None

    def read_image_as_base64(self, file_path):
        if not file_path or not os.path.exists(file_path): return None
        try:
            ext = os.path.splitext(file_path)[1].lower()
            mime_type = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg'}.get(ext, 'application/octet-stream')
            with open(file_path, "rb") as image_file:
                encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
                return f"data:{mime_type};base64,{encoded_string}"
        except Exception as e:
            print(f"Error reading image file: {e}")
            return None

    def get_mouse_position(self):
        try:
            x, y = pyautogui.position()
            return {'x': x, 'y': y}
        except Exception as e:
            return None

    def save_file(self, path, data):
        try:
            with open(path, 'w') as f: json.dump(data, f, indent=4)
            return {'success': True}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def load_file(self, path):
        try:
            with open(path, 'r') as f: data = json.load(f)
            return {'success': True, 'data': data}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def register_hotkeys(self, hotkeys):
        """ Receives hotkey configuration from JS and updates the listener. """
        global hotkey_manager
        if hotkey_manager:
            # Run the listener update in a separate thread to avoid blocking
            threading.Thread(target=hotkey_manager.update_and_restart_listener, args=(hotkeys,)).start()
        return {'success': True}

    def run_macro(self, macro_data):
        """ Receives a serialized macro from JS and executes it. """
        global macro_runner_thread
        if macro_runner_thread and macro_runner_thread.is_alive():
            print("A macro is already running.")
            return {'success': False, 'error': 'A macro is already running.'}
        
        window = webview.windows[0]
        runner = MacroRunner(macro_data, window)
        macro_runner_thread = threading.Thread(target=runner.run, daemon=True)
        macro_runner_thread.start()
        return {'success': True}


# --- Entry Point ---
if __name__ == '__main__':
    load_user_settings()
    api = Api()
    frontend_path = get_path('index.html')

    window = webview.create_window(
        'MacroBot',
        frontend_path,
        js_api=api,
        width=1280,
        height=720,
        resizable=True,
        min_size=(800, 600),
        frameless=False,
        background_color='#1a1b26'
    )

    def on_loaded():
        global hotkey_manager
        hotkey_manager = HotkeyManager(window)
        # Start maximized correctly
        window.maximize()

    window.events.loaded += on_loaded
    webview.start(debug=True)
