#!/usr/bin/env python3
"""
Exercise Launcher - Main Menu for Dexteriteers Project
Run this file to select and launch different exercises
"""

import os
import sys
import subprocess
import time
from exercises.reach_bottle_test import reach_test
from exercises.grab_hold_test import grab_test
from exercises.lift_to_mouth_test import lift
from exercises.hold_at_mouth_test import hold
from exercises.dump_into_mouth_test import dump
from exercises.place_cup_down_test import down

def clear_screen():
    """Clear the terminal screen"""
    os.system('cls' if os.name == 'nt' else 'clear')

def print_header():
    """Print the application header"""
    print("=" * 60)
    print("🎯 DEXTERITEERS PROJECT - EXERCISE LAUNCHER 🎯")
    print("=" * 60)
    print("Welcome to the Dexteriteers Project!")
    print("Select an exercise from the menu below:")
    print()

def print_menu():
    """Print the exercise menu"""
    print("📋 AVAILABLE EXERCISES:")
    print("1. 🎯 Reach Bottle Test")
    print("   - Measures reaction time, reach time, and trajectory smoothness")
    print("   - Extend your hand toward a detected bottle")
    print()
    print("2. ✊ Grab/Hold Test")
    print("   - Measures grip completion time and grip stability during initial hold")
    print("   - Grasp a detected bottle and hold steadily")
    print()
    print("3. 🥤 Lift to Mouth Test")
    print("   - Measures lift time, smoothness, and mouth alignment after grab")
    print()
    print("4. 🦷 Hold at Mouth Test")
    print("   - Measures hold duration and positional stability at mouth")
    print()
    print("5. 🧪 Dump into Mouth Test")
    print("   - Measures tilt angle and pour smoothness (jerks count)")
    print()
    print("6. 📥 Place Cup Down Test")
    print("   - Measures placement smoothness and final position accuracy")
    print()
    print("0. ❌ Exit")
    print()

def run_exercise(exercise_number):
    """Run the selected exercise"""
    clear_screen()
    
    if exercise_number == 1:
        print("🎯 Launching Reach Bottle Test...")
        print("Make sure you have a bottle visible and your right hand in view!")
        print()
        time.sleep(1)
        result_reach_bottle = reach_test()
        print(result_reach_bottle)
            
    elif exercise_number == 2:
        print("✊ Launching Grab/Hold Test...")
        print("Grasp a bottle and hold it steady")
        print()
        time.sleep(1)
        grab_hold_result = grab_test()
        print(grab_hold_result)

    elif exercise_number == 3:
        print("🥤 Launching Lift to Mouth Test...")
        print("Lift the grabbed bottle to mouth level and hold briefly")
        print()
        time.sleep(1)
        lift_test_result = lift()
        print(lift_test_result)

    elif exercise_number == 4:
        print("🦷 Launching Hold at Mouth Test...")
        print("Hold the bottle at mouth level for 5 seconds")
        print()
        time.sleep(1)
        hold_test_result = hold()
        print(hold_test_result)

    elif exercise_number == 5:
        print("🧪 Launching Dump into Mouth Test...")
        print("Tilt the bottle to simulate pouring into mouth")
        print()
        time.sleep(1)
        dump_test_result = dump()
        print(dump_test_result)

    elif exercise_number == 6:
        print("📥 Launching Place Cup Down Test...")
        print("Place the cup down smoothly and accurately")
        print()
        time.sleep(1)
        place_test_result = down()
        print(place_test_result)
    input("\nPress Enter to return to main menu...")

def main():
    """Main launcher function"""
    while True:
        clear_screen()
        print_header()
        print_menu()
        
        try:
            choice = input("Enter your choice (0-6): ").strip()
            
            if choice == '0':
                print("\n👋 Thank you for using Dexteriteers Project!")
                print("Goodbye! 👋")
                break
            elif choice == '1':
                run_exercise(1)
            elif choice == '2':
                run_exercise(2)
            elif choice == '3':
                run_exercise(3)
            elif choice == '4':
                run_exercise(4)
            elif choice == '5':
                run_exercise(5)
            elif choice == '6':
                run_exercise(6)
            else:
                print("\n❌ Invalid choice! Please enter 0, 1, 2, 3, 4, 5, or 6.")
                time.sleep(2)
                
        except KeyboardInterrupt:
            print("\n\n👋 Goodbye! 👋")
            break
        except Exception as e:
            print(f"\n❌ An error occurred: {e}")
            time.sleep(2)

if __name__ == "__main__":
    main()
