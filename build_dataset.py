import csv
import json
import time
from pathlib import Path

import requests

FEED_URL = "https://colorhunt.co/php/feed.php"

HEADERS = {
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "Origin": "https://colorhunt.co",
    "Referer": "https://colorhunt.co/",
    "User-Agent": "Mozilla/5.0",
}

def decode_palette(code: str):
    if not code or len(code) % 6 != 0:
        return []
    return [f"#{code[i:i+6]}" for i in range(0, len(code), 6)]

def fetch_batch(step=0, sort="random", tags=""):
    data = {"step": step, "sort": sort, "tags": tags}
    r = requests.post(FEED_URL, headers=HEADERS, data=data, timeout=20)
    r.raise_for_status()
    return r.json()

def scrape_colorhunt(target_count=100, sort="random", tags=""):
    results = []
    seen = set()
    step = 0

    while len(results) < target_count:
        batch = fetch_batch(step=step, sort=sort, tags=tags)
        if not batch:
            break
        for item in batch:
            code = item.get("code", "")
            if code and code not in seen:
                colors = decode_palette(code)
                if len(colors) == 4:
                    results.append({
                        "id": code,
                        "colors": colors,
                        "likes": int(item.get("likes", "0") or 0),
                        "date": item.get("date", ""),
                    })
                    seen.add(code)
                    if len(results) >= target_count:
                        break
        step += 1
        time.sleep(0.25)

    return results

def save_json(data, path="palettes.json"):
    Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

def save_csv(data, path="palettes.csv"):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["id", "color1", "color2", "color3", "color4", "likes", "date"])
        for row in data:
            c = row["colors"]
            w.writerow([row["id"], c[0], c[1], c[2], c[3], row["likes"], row["date"]])

if __name__ == "__main__":
    palettes = scrape_colorhunt(target_count=100, sort="random", tags="")
    print(f"Collected {len(palettes)} palettes")
    save_json(palettes, "palettes.json")
    save_csv(palettes, "palettes.csv")
