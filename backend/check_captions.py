import json
with open('IMG_1986_viral_captions.json') as f:
    data = json.load(f)
    
# Check for emphasis/hook words
print('Words with emphasis/hook style:')
for w in data['styled_words']:
    if w.get('style') in ('emphasis', 'hook', 'emotional'):
        print(f"  {w['word']}: {w.get('style')} at {w['start']}-{w['end']}")

print()
print('Checking for Obula mentions:')
for w in data['styled_words']:
    if 'obula' in w['word'].lower():
        print(f"  {w['word']}: {w.get('style')} at {w['start']}-{w['end']}")
