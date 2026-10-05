"""Gera as partituras de exemplo (dominio publico) em MusicXML para violino e sax alto.

Uso: python3 scripts/generate_seed_scores.py
Requer: pip install music21
"""
import json
import os
from music21 import converter, stream, instrument, tempo, metadata, interval, meter, clef, key

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "scores")
os.makedirs(OUT, exist_ok=True)

PIECES = [
    {
        "slug": "ode-alegria",
        "title": "Ode à Alegria",
        "composer": "Ludwig van Beethoven",
        "level": "iniciante",
        "style": "classico",
        "bpm": 100,
        "ts": "4/4",
        "base_key": 0,  # C
        "melody": "e4 e f g g f e d c c d e e4. d8 d2 e4 e f g g f e d c c d e d4. c8 c2 "
                  "d4 d e c d e8 f e4 c d e8 f e4 d c d G2 e4 e f g g f e d c c d e d4. c8 c2",
        "bass": "C1 GG1 C1 GG1 C1 GG1 C1 GG2 C2 GG2 C2 GG2 C2 GG2 GG2 C2 GG2 "
                "C1 GG1 C1 GG2 C2",
        "violin": "M2", "sax": "P5",
        "description": "O tema mais famoso da 9.ª Sinfonia. Ideal para dar os primeiros passos.",
    },
    {
        "slug": "brilha-estrelinha",
        "title": "Brilha, Brilha Estrelinha",
        "composer": "Tradicional (França)",
        "level": "iniciante",
        "style": "tradicional",
        "bpm": 90,
        "ts": "4/4",
        "base_key": 0,
        "melody": "c4 c g g a a g2 f4 f e e d d c2 g4 g f f e e d2 g4 g f f e e d2 "
                  "c4 c g g a a g2 f4 f e e d d c2",
        "bass": None,
        "violin": "M2", "sax": "P1",
        "description": "Melodia de 'Ah! vous dirai-je, maman'. Notas longas e intervalos simples.",
    },
    {
        "slug": "frere-jacques",
        "title": "Frère Jacques",
        "composer": "Tradicional (França)",
        "level": "iniciante",
        "style": "tradicional",
        "bpm": 100,
        "ts": "4/4",
        "base_key": 0,
        "melody": "c4 d e c c d e c e f g2 e4 f g2 g8 a g f e4 c g8 a g f e4 c c4 G c2 c4 G c2",
        "bass": None,
        "violin": "M2", "sax": "P5",
        "description": "Cânone tradicional. Ótimo para treinar colcheias.",
    },
    {
        "slug": "minueto-sol",
        "title": "Minueto em Sol",
        "composer": "Christian Petzold (atrib. J. S. Bach)",
        "level": "intermedio",
        "style": "classico",
        "bpm": 110,
        "ts": "3/4",
        "base_key": 1,  # G
        "melody": "d'4 g8 a b c' d'4 g g e'4 c'8 d' e' f#' g'4 g g c'4 d'8 c' b a b4 c'8 b a g "
                  "f#4 g8 a b g b4 a2 d'4 g8 a b c' d'4 g g e'4 c'8 d' e' f#' g'4 g g "
                  "c'4 d'8 c' b a b4 c'8 b a g a4 b8 a g f# g2.",
        "bass": "G2 A4 B2. c2. B2. A2. G2. d4 B G d4 D8 c B A G2 A4 B2. c2. B2. A2. G2. c4 d D G2 GG4",
        "violin": "P1", "sax": "P1",
        "description": "Peça do Caderno de Anna Magdalena Bach. Com acompanhamento de piano.",
    },
    {
        "slug": "amazing-grace",
        "title": "Amazing Grace",
        "composer": "Tradicional (EUA)",
        "level": "iniciante",
        "style": "gospel",
        "bpm": 80,
        "ts": "3/4",
        "base_key": 1,
        "melody": "r2 d4 g2 b8 g b2 a4 g2 e4 d2 d4 g2 b8 g b2 a8 b d'2. d'2 b4 "
                  "d'4. b8 b g b2 a4 g2 e4 d2 d4 g2 b8 g b2 a4 g2.",
        "bass": None,
        "violin": "P1", "sax": "P1",
        "description": "Hino clássico, lento e expressivo. Bom para trabalhar o som.",
    },
    {
        "slug": "when-the-saints",
        "title": "When the Saints Go Marching In",
        "composer": "Tradicional (EUA)",
        "level": "intermedio",
        "style": "jazz",
        "bpm": 120,
        "ts": "4/4",
        "base_key": 0,
        "melody": "r4 c e f g1 r4 c e f g1 r4 c e f g2 e2 c2 e2 d1 "
                  "r4 e e d c2. c4 e2 g4 g f1 r4 e f g e2 c2 d2 d2 c1",
        "bass": "C2 GG2 C2 GG2 C2 GG2 C2 GG2 C2 GG2 C2 GG2 C2 GG2 GG2 D2 "
                "C2 GG2 C2 GG2 C2 GG2 F2 C2 C2 GG2 C2 GG2 GG2 D2 C1",
        "violin": "P5", "sax": "P5",
        "description": "Clássico de Nova Orleães. Ritmo marcado, perfeito para sax.",
    },
]

FIFTHS_OF = {"P1": 0, "M2": 2, "P5": 1, "P4": -1}


def build(piece, inst):
    written_iv = interval.Interval(piece[inst])
    melody = converter.parse("tinyNotation: " + piece["ts"] + " " + piece["melody"])
    melody = melody.transpose(written_iv)
    sc = stream.Score()
    sc.metadata = metadata.Metadata()
    sc.metadata.title = piece["title"]
    sc.metadata.composer = piece["composer"]

    solo = stream.Part()
    if inst == "violin":
        ins = instrument.Violin()
        ins.partName = "Violino"
    else:
        ins = instrument.AltoSaxophone()
        ins.partName = "Saxofone Alto"
    solo.insert(0, ins)
    measures = list(melody.getElementsByClass(stream.Measure))
    k = key.KeySignature(piece["base_key"] + FIFTHS_OF[piece[inst]])
    for i, m in enumerate(measures):
        m = m.__deepcopy__()
        for ks in m.getElementsByClass(key.KeySignature):
            m.remove(ks)
        if i == 0:
            m.insert(0, k)
            m.insert(0, tempo.MetronomeMark(number=piece["bpm"]))
            m.insert(0, clef.TrebleClef())
        solo.append(m)
    if inst == "sax":
        solo.atSoundingPitch = False
    sc.insert(0, solo)

    if piece["bass"]:
        # piano soa em concert pitch
        semis = written_iv.semitones - (9 if inst == "sax" else 0)
        if semis < -5:
            semis += 12
        bass = converter.parse("tinyNotation: " + piece["ts"] + " " + piece["bass"])
        bass = bass.transpose(semis)
        pno = stream.Part()
        pi = instrument.Piano()
        pi.partName = "Piano"
        pno.insert(0, pi)
        concert_fifths = piece["base_key"] + FIFTHS_OF[piece[inst]] + (-3 if inst == "sax" else 0)
        for i, m in enumerate(bass.getElementsByClass(stream.Measure)):
            m = m.__deepcopy__()
            for ks in m.getElementsByClass(key.KeySignature):
                m.remove(ks)
            if i == 0:
                m.insert(0, key.KeySignature(concert_fifths))
                m.insert(0, clef.BassClef())
            pno.append(m)
        sc.insert(0, pno)
    return sc


manifest = []
for p in PIECES:
    for inst in ("violin", "sax"):
        sc = build(p, inst)
        fname = f"{p['slug']}-{inst}.musicxml"
        sc.write("musicxml", fp=os.path.join(OUT, fname))
        manifest.append({
            "id": f"seed-{p['slug']}-{inst}",
            "title": p["title"],
            "composer": p["composer"],
            "instrument": "violin" if inst == "violin" else "altosax",
            "level": p["level"],
            "style": p["style"],
            "bpm": p["bpm"],
            "description": p["description"],
            "xmlUrl": f"/scores/{fname}",
            "hasAccompaniment": bool(p["bass"]),
            "status": "published",
            "seed": True,
        })

with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)
print("ok", len(manifest))
