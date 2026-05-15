# Pico PIR Wake Setup (Keyboard Emulation)

This guide sets up a Raspberry Pi Pico + PIR sensor so motion wakes your kiosk display by sending a keyboard key over USB.

The goal is simple:
- no keyboard needed for daily operation
- display sleeps overnight
- motion wakes the screen

## 1. Recommended Hardware

- Raspberry Pi Pico (or Pico H)
- PIR motion sensor module (HC-SR501 style)
- Breadboard
- Jumper wires
- USB cable (Pico to kiosk)

Optional:
- Small enclosure
- Dupont connectors with locking clips

## 2. High-Level Design

- PIR detects motion and drives a GPIO pin HIGH.
- Pico reads that pin.
- Pico emulates a USB keyboard and sends one harmless key press.
- Linux/X receives key event, wakes display from DPMS sleep.

## 3. Wiring (HC-SR501 -> Pico)

Use this default wiring:
- PIR VCC -> Pico VBUS (5V)
- PIR GND -> Pico GND
- PIR OUT -> Pico GP15

Notes:
- HC-SR501 output is typically 3.3V logic compatible for Pico GPIO.
- Keep wire lengths short and stable.

## 4. Firmware Choice

You asked about MicroPython. For USB keyboard emulation, CircuitPython is usually easier and more reliable on Pico.

Recommended path:
- CircuitPython firmware
- adafruit_hid keyboard library

If you strongly prefer MicroPython, you will likely need a TinyUSB HID-enabled build and more custom code. Start with CircuitPython for first success, then migrate later if needed.

## 5. Flash CircuitPython on Pico

1. Hold BOOTSEL while plugging Pico into your computer.
2. Pico mounts as `RPI-RP2`.
3. Copy CircuitPython UF2 for Pico onto it.
4. Pico reboots and mounts as `CIRCUITPY`.

## 6. Install HID Library on Pico

On `CIRCUITPY` drive:
- create `lib/` if missing
- copy these from CircuitPython bundle:
  - `adafruit_hid/`

## 7. Pico Code (save as code.py)

```python
import time
import board
import digitalio
import usb_hid

from adafruit_hid.keyboard import Keyboard
from adafruit_hid.keycode import Keycode

# PIR output pin
pir = digitalio.DigitalInOut(board.GP15)
pir.direction = digitalio.Direction.INPUT
pir.pull = digitalio.Pull.DOWN

kbd = Keyboard(usb_hid.devices)

# Debounce and anti-spam controls
COOLDOWN_SECONDS = 20
last_trigger = 0

while True:
    now = time.monotonic()
    if pir.value and (now - last_trigger) > COOLDOWN_SECONDS:
        # Send a harmless key to wake display.
        # SHIFT is usually safe and does not type text.
        kbd.press(Keycode.LEFT_SHIFT)
        kbd.release_all()
        last_trigger = now

    time.sleep(0.05)
```

## 8. Kiosk Linux Side Verification

Plug Pico into kiosk and run:

```bash
lsusb
sudo dmesg | tail -n 80
```

You should see a USB HID keyboard device.

Optional key event check:

```bash
sudo libinput debug-events
```

Move in front of PIR and confirm key events appear.

## 9. Display Sleep + Wake Policy

Use kiosk display policy like:
- sleep: 00:00 to 05:00
- wake: on PIR motion keypress

You can keep your app running while only the display sleeps.

Suggested implementation phases:
1. manually force display off and test PIR wake
2. add scheduled sleep at night
3. tune PIR sensitivity and cooldown

## 10. First Test Procedure

1. Confirm Pico is detected as keyboard.
2. Manually force display off (DPMS command).
3. Trigger PIR motion.
4. Verify screen wakes quickly.
5. Confirm no unwanted app actions occur from wake key.

If key causes side effects, switch to another keycode (for example F13/F14/F15) and retest.

## 11. PIR Sensor Tuning

HC-SR501 has two potentiometers:
- Sensitivity (distance)
- Delay (how long output stays HIGH)

Starting point:
- medium sensitivity
- short delay
- tune in real location over 1-2 days

## 12. Reliability and Safety Notes

- Put Pico + PIR in stable enclosure away from direct HVAC airflow.
- Avoid mounting PIR where hallway traffic causes constant triggers.
- Use cooldown in code to avoid rapid wake spam.
- Keep fallback keyboard access during setup and recovery.

## 13. Troubleshooting

No USB keyboard detected:
- Reflash CircuitPython
- try another USB cable (data-capable)
- check dmesg for USB errors

PIR always triggered:
- reduce sensitivity
- reduce temperature noise sources
- verify GND and OUT wiring

Display does not wake:
- verify key events in `libinput debug-events`
- test with a normal USB keyboard keypress to confirm DPMS wake path
- confirm display is sleeping via DPMS, not powered off physically

## 14. Next Integration Step (When Parts Arrive)

After wake is working, integrate with kiosk policy:
- nighttime sleep schedule
- daytime anti-burn minor layout drift
- optional carousel only if it adds user value
