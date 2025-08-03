#!/usr/bin/python3 -u

from selenium import webdriver
from selenium.webdriver.chrome.options import Options as chrome_options
from selenium.webdriver.firefox.options import Options as firefox_options
from selenium.webdriver.edge.options import Options as edge_options
import os
import sys
import time
import json
import base64
import threading

url = "https://testpage"
if len(sys.argv) > 1:
    url += sys.argv[1]
print(url)

target_browser = os.environ["TARGET_BROWSER"]
if target_browser == 'chrome':
    options = chrome_options()
elif target_browser == 'firefox':
    options = firefox_options()
elif target_browser == 'edge':
    options = edge_options()
else:
    print(f"unknown target browser: {target_browser}")
    sys.exit(1)

print(f"target browser: {target_browser}")
MAX_RETRIES = 30  # Retry for up to 30 seconds
WAIT_TIME = 1  # Wait 1 second between retries

start_time = time.time()
while True:
    try:
        driver = webdriver.Remote(command_executor=os.environ["SELENIUM_URL"], options=options)
        print("selenium up and running")
        break
    except Exception as e:
        elapsed_time = time.time() - start_time
        if elapsed_time > MAX_RETRIES:
            print(f"Error: selenium is not available after {MAX_RETRIES} seconds.")
            raise e
        print(f"Waiting for selenium...")
        time.sleep(WAIT_TIME)  # Wait before retrying

driver.get(url)

start_time = time.time()
while True:
    try:
        user_agent = driver.execute_script("return navigator.userAgent;")
        print(f"user agent: {user_agent}")
        break
    except Exception as e:
        elapsed_time = time.time() - start_time
        if elapsed_time > MAX_RETRIES:
            print(f"Error: page is not available after {MAX_RETRIES} seconds.")
            raise e
        print(f"Waiting for page...")
        time.sleep(WAIT_TIME)  # Wait before retrying

def send_input(char):
    """Send a character to the web page via `input()`."""
    char_escaped = base64.b64encode(char.encode()).decode()
    driver.execute_script(f"input('{char_escaped}')")

def monitor_output():
    """Continuously monitor the page for new output and print it."""
    try:
        while True:
            output_text = driver.execute_script("return getOutput();")
            if output_text != "":
                sys.stdout.write(output_text)
                sys.stdout.flush()
            time.sleep(0.05)
    except Exception as e:
        print("Stopping output monitoring.")
        raise e

try:
    output_thread = threading.Thread(target=monitor_output, daemon=True)
    output_thread.start()

    while True:
        char = sys.stdin.read(1)
        if not char:
            break
        send_input(char)
finally:
    print("Closing...")
    driver.quit()
    print("DONE")
