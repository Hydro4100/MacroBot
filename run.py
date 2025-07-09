import webview
import os
import sys
import base64
import pyautogui
import json
import time
import threading
import requests # Make sure to install this: pip install requests
import webbrowser
from packaging import version # Make sure to install this: pip install packaging

# --- Hotkey Library Import ---
try:
    from pynput import keyboard
    pynput_installed = True
except ImportError:
    pynput_installed = False

# --- Application Version ---
APP_VERSION = "0.1.2" # Using a standard versioning scheme

# --- Global State for Macro Execution ---
macro_runner_instance = None
hotkey_manager = None
user_settings = {}

# --- Helper function to get a file path ---
def get_path(relative_path, user_data=False):
    """ Get absolute path to resource, works for dev and for PyInstaller """
    if user_data:
        # Use a consistent user data directory for settings
        app_data_dir = os.path.join(os.path.expanduser("~"), ".MacroBot")
        if not os.path.exists(app_data_dir):
            os.makedirs(app_data_dir)
        return os.path.join(app_data_dir, relative_path)
    
    # This part is for bundled assets like index.html, css, js
    try:
        # PyInstaller creates a temp folder and stores path in _MEIPASS
        base_path = sys._MEIPASS
    except Exception:
        # We are running in a normal Python environment.
        base_path = os.path.abspath(".")

    return os.path.join(base_path, "frontend", relative_path)

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
        self.node_outputs = {} # Stores dynamic outputs from nodes like loop index

    def stop(self):
        self.is_running = False
        self.window.evaluate_js('window.clearNodeHighlights()')
        print("Macro execution stopped by user.")

    def run(self):
        # The entire run process is wrapped in a try...finally block
        # to ensure cleanup happens and the global instance is cleared.
        try:
            self.is_running = True
            print("Starting macro execution...")
            self.window.evaluate_js('window.clearNodeHighlights()')
            
            start_node_id = self.macro_data.get('start_node_id')
            if not start_node_id:
                print("Error: No start_node_id provided.")
                return

            start_node = self.nodes.get(start_node_id)
            if not start_node:
                print(f"Error: Start node {start_node_id} not found.")
                return
                
            should_loop = start_node.get('values', {}).get('Loop Continuously', False)

            # If the macro is not set to loop, just run the execution path once.
            if not should_loop:
                self.execute_path(start_node_id)
            else:
                # If looping, continue executing the path until stopped.
                while self.is_running:
                    self.execute_path(start_node_id)
                    # If the macro was stopped during execution, don't sleep.
                    if self.is_running:
                        time.sleep(0.1)

        finally:
            print("Macro execution finished.")
            self.window.evaluate_js('window.clearNodeHighlights()')
            global macro_runner_instance
            macro_runner_instance = None
    
    def execute_path(self, start_node_id):
        """ Executes a chain of nodes starting from a given node ID. """
        current_node_id = start_node_id
        while current_node_id and self.is_running:
            node = self.nodes.get(current_node_id)
            if not node:
                print(f"Error: Node {current_node_id} not found in execution path.")
                break

            self.window.evaluate_js(f"window.highlightNode('{current_node_id}')")
            
            # The 'start' node doesn't have an action, it just directs flow.
            # For all other nodes, execute their action and determine the next path.
            next_pin_name = 'exec'
            if node.get('type') != 'start':
                next_pin_name = self.execute_node(node)
            
            time.sleep(0.05)

            if not self.is_running:
                break

            # Find the next connection based on the output pin name from the executed node.
            next_connection = next((c for c in self.connections if c['startNodeId'] == current_node_id and c['startPinName'] == next_pin_name and c['flow'] == 'exec'), None)
            
            if next_connection:
                current_node_id = next_connection['endNodeId']
            else:
                # End of this execution path.
                current_node_id = None

    def get_input_value(self, current_node_id, pin_name, expected_type, default_value=None):
        """
        Gets the value for a data input pin, either from a connection or
        from the node's default value.
        """
        # Find if this input pin is connected to another node's output.
        connection = next((c for c in self.connections if c['endNodeId'] == current_node_id and c['endPinName'] == pin_name and c['flow'] == 'data'), None)

        value = None
        if connection:
            # If connected, recursively evaluate the source node's output pin.
            value = self.evaluate_output_pin(connection['startNodeId'], connection['startPinName'])
        
        # If not connected, or if the connected node returned None, use the default.
        if value is None:
            node = self.nodes.get(current_node_id)
            value = node.get('values', {}).get(pin_name, default_value)


        # Coerce the value to the type expected by the pin.
        if value is None:
            if expected_type == 'number': return 0
            if expected_type == 'string': return ""
            if expected_type == 'boolean': return False
            return None

        try:
            if expected_type == 'number': return float(value)
            if expected_type == 'string': return str(value)
            if expected_type == 'boolean':
                if isinstance(value, bool):
                    return value
                if isinstance(value, str):
                    val_lower = value.strip().lower()
                    if val_lower in ['true', '1', 't', 'y', 'yes']:
                        return True
                    if val_lower in ['false', '0', 'f', 'n', 'no']:
                        return False
                if isinstance(value, (int, float)):
                    return value != 0
                return False # Default to false if type is ambiguous
            return value # Return original value if type not matched
        except (ValueError, TypeError):
            # Fallback to a sensible default if casting fails.
            if expected_type == 'number': return 0
            if expected_type == 'string': return ""
            if expected_type == 'boolean': return False
        return None

    def evaluate_output_pin(self, node_id, pin_name):
        """
        Evaluates the value of a data output pin. This is used for data nodes
        (like Math, Compare) and for nodes that generate data during execution (like Loops).
        """
        node = self.nodes.get(node_id)
        if not node: return None
        node_type = node.get('type')

        # Check for dynamic data generated by an execution node (e.g., loop index).
        if node_id in self.node_outputs and pin_name in self.node_outputs[node_id]:
            return self.node_outputs[node_id][pin_name]

        # Handle pure data nodes that just calculate or provide a value.
        if node_type == 'number_literal':
            return self.get_input_value(node_id, 'value', 'number', 0)
        
        elif node_type == 'string_literal':
            return self.get_input_value(node_id, 'value', 'string', "")

        elif node_type == 'math':
            values = node.get('values', {})
            val_a = self.get_input_value(node_id, 'A', 'number', 0)
            val_b = self.get_input_value(node_id, 'B', 'number', 0)
            operator = values.get('Operator', 'add')
            if operator == 'add':
                return val_a + val_b
            elif operator == 'subtract':
                return val_a - val_b
            elif operator == 'multiply':
                return val_a * val_b
            elif operator == 'divide':
                return val_a / val_b if val_b != 0 else 0
            return 0 # Default return for math node
        
        elif node_type == 'compare':
            values = node.get('values', {})
            op_type = values.get('Type', 'number')
            operator = values.get('Operator', '==').strip()
            result = False # Default to False

            try:
                if op_type == 'number':
                    val_a = self.get_input_value(node_id, 'A', 'number', 0)
                    val_b = self.get_input_value(node_id, 'B', 'number', 0)
                    
                    if operator == '==': result = (val_a == val_b)
                    elif operator == '!=': result = (val_a != val_b)
                    elif operator == '>': result = (val_a > val_b)
                    elif operator == '<': result = (val_a < val_b)
                    elif operator == '>=': result = (val_a >= val_b)
                    elif operator == '<=': result = (val_a <= val_b)
                
                elif op_type == 'string':
                    val_a = self.get_input_value(node_id, 'A', 'string', "")
                    val_b = self.get_input_value(node_id, 'B', 'string', "")
                    
                    if operator == '==': result = (val_a == val_b)
                    elif operator == '!=': result = (val_a != val_b)
                    elif operator == 'contains': result = (val_b in val_a)
                    elif operator == 'starts_with': result = val_a.startswith(val_b)
                    elif operator == 'ends_with': result = val_a.endswith(val_b)
            
            except Exception as e:
                print(f"Error during comparison in node {node_id}: {e}")
                return False # Explicitly return False on error
            
            return result
        
        return None

    def execute_node(self, node):
        node_type = node.get('type')
        values = node.get('values', {})
        node_id = node.get('id')
        print(f"Executing node: {node_id} ({node_type})")
        
        next_exec_pin = 'exec' # Default for simple nodes

        try:
            if not self.is_running: return None

            if node_type == 'delay':
                duration = self.get_input_value(node_id, 'Duration', 'number', 1)
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
                x_pos = self.get_input_value(node_id, 'X', 'number', 0)
                y_pos = self.get_input_value(node_id, 'Y', 'number', 0)
                duration = self.get_input_value(node_id, 'Duration', 'number', 0.25)
                unit = values.get('Unit', 'seconds')
                if unit == 'milliseconds':
                    duration /= 1000.0
                
                pyautogui.moveTo(x=int(x_pos), y=int(y_pos), duration=duration)
            
            elif node_type == 'key_press':
                key_info = values.get('Key', {})
                pynput_str = key_info.get('pynput', '')
                if not pynput_str:
                    return next_exec_pin

                if '+' not in pynput_str:
                    key_to_press = pynput_str.replace('<', '').replace('>', '')
                    pyautogui.press(key_to_press)
                else:
                    keys = pynput_str.replace('<', '').replace('>', '').split('+')
                    pyautogui.hotkey(*keys)
            
            elif node_type == 'type_string':
                text_to_type = self.get_input_value(node_id, 'Text', 'string', "")
                delay = self.get_input_value(node_id, 'Delay', 'number', 50)
                unit = values.get('Unit', 'milliseconds')
                if unit == 'milliseconds':
                    delay /= 1000.0
                
                pyautogui.typewrite(text_to_type, interval=delay)

            elif node_type == 'loop': # For Loop
                iterations = int(self.get_input_value(node_id, 'Iterations', 'number', 5))
                loop_body_conn = next((c for c in self.connections if c['startNodeId'] == node_id and c['startPinName'] == 'Loop Body'), None)

                if loop_body_conn:
                    for i in range(iterations):
                        if not self.is_running: break
                        # Store the current index so it can be accessed by other nodes.
                        self.node_outputs[node_id] = {'Index': i}
                        # Execute the entire path connected to the 'Loop Body' pin.
                        self.execute_path(loop_body_conn['endNodeId'])
                
                # After the loop is done, the next path to follow is 'Completed'.
                next_exec_pin = 'Completed'

            elif node_type == 'while_loop':
                loop_body_conn = next((c for c in self.connections if c['startNodeId'] == node_id and c['startPinName'] == 'Loop Body'), None)
                
                if loop_body_conn:
                    # Loop as long as the condition is true and the macro is running.
                    while self.get_input_value(node_id, 'Condition', 'boolean', False) and self.is_running:
                        self.execute_path(loop_body_conn['endNodeId'])

                next_exec_pin = 'Completed'
            
            elif node_type == 'if_statement':
                condition = self.get_input_value(node_id, 'Condition', 'boolean', False)
                if condition:
                    next_exec_pin = 'True'
                else:
                    next_exec_pin = 'False'

        except Exception as e:
            print(f"Error executing node {node_id}: {e}")
            self.stop()

        return next_exec_pin


# --- Hotkey Management ---
class HotkeyManager:
    def __init__(self, window):
        self.window = window
        self.listener = None
        self.lock = threading.Lock()

    def update_and_restart_listener(self, hotkey_config):
        # Do nothing if pynput is not installed
        if not pynput_installed:
            return

        with self.lock:
            if self.listener:
                self.listener.stop()

            hotkeys_to_listen = {}
            for hotkey_str, action in hotkey_config.items():
                def on_activate(act=action):
                    # Define the work to be done in a separate function
                    def work():
                        if act == 'emergency_stop':
                            global macro_runner_instance
                            if macro_runner_instance and macro_runner_instance.is_running:
                                macro_runner_instance.stop()
                                print("Emergency stop activated.")
                        else:
                            # Call back to the frontend
                            js_code = f"window.triggerMacroByHotkey('{act}')"
                            self.window.evaluate_js(js_code)
                    
                    # Run the work in a new thread to ensure the listener doesn't block
                    threading.Thread(target=work, daemon=True).start()

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
        """ Toggles a macro's execution. Starts it if not running, stops it if it is. """
        global macro_runner_instance
        
        # If a macro is currently running, stop it.
        if macro_runner_instance and macro_runner_instance.is_running:
            # Optional: Check if it's the same macro being triggered.
            # This prevents one hotkey from stopping a different macro.
            if macro_runner_instance.macro_data.get('start_node_id') == macro_data.get('start_node_id'):
                macro_runner_instance.stop()
                print("Macro toggled off.")
                return {'success': True, 'action': 'stopped'}
            else:
                print("Another macro is already running. Stop it before starting a new one.")
                return {'success': False, 'error': 'Another macro is already running.'}

        # If no macro is running, start a new one.
        window = webview.windows[0]
        runner = MacroRunner(macro_data, window)
        macro_runner_instance = runner
        
        thread = threading.Thread(target=runner.run, daemon=True)
        thread.start()
        
        return {'success': True, 'action': 'started'}

    def open_url(self, url):
        """ Opens a URL in the user's default web browser. """
        try:
            webbrowser.open(url)
            return {'success': True}
        except Exception as e:
            print(f"Failed to open URL: {e}")
            return {'success': False, 'error': str(e)}

    def check_for_updates(self):
        """ Checks GitHub for the latest release version. """
        repo_url = "https://api.github.com/repos/Hydro4100/MacroBot/releases/latest"
        try:
            response = requests.get(repo_url, timeout=5)
            response.raise_for_status()  # Raise an exception for bad status codes
            
            latest_release = response.json()
            latest_version_str = latest_release.get('tag_name', 'v0.0.0').lstrip('v')
            
            # Use the 'packaging' library for robust version comparison
            if version.parse(latest_version_str) > version.parse(APP_VERSION):
                return {
                    "update_available": True,
                    "latest_version": latest_version_str,
                    "download_url": latest_release.get('html_url')
                }
            else:
                return {"update_available": False}

        except requests.exceptions.RequestException as e:
            print(f"Update check failed: {e}")
            return {"update_available": False, "error": "Could not connect to GitHub to check for updates."}
        except Exception as e:
            print(f"An unexpected error occurred during update check: {e}")
            return {"update_available": False, "error": "An unexpected error occurred."}


# --- Entry Point ---
if __name__ == '__main__':
    load_user_settings()
    api = Api()
    # When running from the script, the frontend path is relative
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
        if pynput_installed:
            hotkey_manager = HotkeyManager(window)
        else:
            print("Warning: pynput is not installed. Hotkeys will not work.")
            print("Install it with: pip install pynput")
        
        # Start maximized correctly
        window.maximize()

    window.events.loaded += on_loaded
    webview.start(debug=False)
