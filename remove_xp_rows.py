import sys

if len(sys.argv) != 2:
    print("Usage: python remove_xp_rows.py <filename>")
    sys.exit(1)

filename = sys.argv[1]

with open(filename, "r") as f:
    lines = f.readlines()

filtered_lines = [line for line in lines if "rXP" not in line]

with open(filename, "w") as f:
    f.writelines(filtered_lines)

print(f"Done. Removed {len(lines) - len(filtered_lines)} row(s) containing 'xp'.")
