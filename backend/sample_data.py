"""
Deterministic generator for a messy customer dataset with known ground truth.

This exists for three reasons:

1. Demo mode needs a dataset that shows real duplicates on first run, without
   asking anyone to find their own CSV.
2. Correctness tests need ground truth. Entity resolution is easy to get
   subtly wrong, and "it returned some clusters" is not a test. Every row
   carries ``true_entity_id`` so precision and recall are measurable.
3. Probabilistic linkage needs volume. EM cannot estimate anything useful from
   a handful of rows, so the default size is large enough to actually train.

The corruptions are modelled on what real customer databases contain: the same
person entered twice by different staff, imported from different systems, or
typed in by hand at a checkout.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Optional

import pandas as pd

FIRST_NAMES = [
    "James", "Mary", "Robert", "Patricia", "John", "Jennifer", "Michael", "Linda",
    "David", "Elizabeth", "William", "Barbara", "Richard", "Susan", "Joseph",
    "Jessica", "Thomas", "Sarah", "Christopher", "Karen", "Daniel", "Nancy",
    "Matthew", "Lisa", "Anthony", "Margaret", "Priya", "Rahul", "Aisha", "Wei",
    "Yuki", "Carlos", "Sofia", "Ahmed", "Fatima", "Ravi", "Ananya", "Chen",
]

NICKNAMES = {
    "James": "Jim", "Robert": "Bob", "John": "Johnny", "William": "Bill",
    "Richard": "Rick", "Joseph": "Joe", "Thomas": "Tom", "Christopher": "Chris",
    "Daniel": "Dan", "Matthew": "Matt", "Anthony": "Tony", "Michael": "Mike",
    "Elizabeth": "Liz", "Jennifer": "Jen", "Patricia": "Pat", "Barbara": "Barb",
    "Susan": "Sue", "Jessica": "Jess", "Margaret": "Maggie", "Katherine": "Kate",
}

LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
    "Taylor", "Moore", "Jackson", "Martin", "Lee", "Patel", "Sharma", "Kumar",
    "Singh", "Nair", "Menon", "Reddy", "Chen", "Wang", "Nguyen", "Kim", "Okafor",
]

STREETS = [
    "Maple", "Oak", "Cedar", "Pine", "Elm", "Washington", "Lake", "Hill",
    "Park", "Sunset", "River", "Church", "Market", "Bridge", "Station",
]

STREET_TYPES = [("Street", "St"), ("Avenue", "Ave"), ("Road", "Rd"),
                ("Boulevard", "Blvd"), ("Lane", "Ln"), ("Drive", "Dr")]

CITIES = [
    ("London", "UK"), ("Manchester", "UK"), ("Birmingham", "UK"),
    ("New York", "US"), ("Chicago", "US"), ("Austin", "US"), ("Seattle", "US"),
    ("Bangalore", "IN"), ("Mumbai", "IN"), ("Kochi", "IN"), ("Delhi", "IN"),
    ("Toronto", "CA"), ("Sydney", "AU"), ("Berlin", "DE"), ("Dublin", "IE"),
]

EMAIL_DOMAINS = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com",
                 "protonmail.com", "icloud.com"]

KEYBOARD_NEIGHBOURS = {
    "a": "sq", "b": "vn", "c": "xv", "d": "sf", "e": "wr", "f": "dg", "g": "fh",
    "h": "gj", "i": "uo", "j": "hk", "k": "jl", "l": "k", "m": "n", "n": "bm",
    "o": "ip", "p": "o", "q": "wa", "r": "et", "s": "ad", "t": "ry", "u": "yi",
    "v": "cb", "w": "qe", "x": "zc", "y": "tu", "z": "x",
}


@dataclass
class Person:
    entity_id: int
    first_name: str
    last_name: str
    email: str
    phone: str
    address: str
    city: str
    country: str
    signup_date: str


def _typo(text: str, rng: random.Random) -> str:
    """One realistic keyboard slip, transposition, or dropped character."""
    if len(text) < 3:
        return text
    kind = rng.choice(["swap", "drop", "neighbour", "double"])
    i = rng.randrange(1, len(text) - 1)

    if kind == "swap":
        return text[:i] + text[i + 1] + text[i] + text[i + 2:]
    if kind == "drop":
        return text[:i] + text[i + 1:]
    if kind == "double":
        return text[:i] + text[i] + text[i:]
    neighbours = KEYBOARD_NEIGHBOURS.get(text[i].lower())
    if not neighbours:
        return text
    replacement = rng.choice(neighbours)
    return text[:i] + (replacement.upper() if text[i].isupper() else replacement) + text[i + 1:]


def _make_person(entity_id: int, rng: random.Random) -> Person:
    first = rng.choice(FIRST_NAMES)
    last = rng.choice(LAST_NAMES)
    city, country = rng.choice(CITIES)
    full_street, _ = rng.choice(STREET_TYPES)

    return Person(
        entity_id=entity_id,
        first_name=first,
        last_name=last,
        email=f"{first.lower()}.{last.lower()}{rng.randrange(1, 999)}@{rng.choice(EMAIL_DOMAINS)}",
        phone=f"+{rng.randrange(1, 99)} {rng.randrange(100, 999)} {rng.randrange(100, 999)} {rng.randrange(1000, 9999)}",
        address=f"{rng.randrange(1, 999)} {rng.choice(STREETS)} {full_street}",
        city=city,
        country=country,
        signup_date=f"20{rng.randrange(18, 26):02d}-{rng.randrange(1, 13):02d}-{rng.randrange(1, 29):02d}",
    )


def _corrupt(person: Person, rng: random.Random) -> Person:
    """Produce a plausible duplicate: the same human, entered differently.

    Corruptions are applied selectively rather than all at once -- a record
    where every field is mangled is not a duplicate anyone would recognise, and
    would not be one a matcher should find.
    """
    first, last = person.first_name, person.last_name
    email, phone, address, city = person.email, person.phone, person.address, person.city

    # Nickname substitution: "Robert" -> "Bob".
    if rng.random() < 0.30 and first in NICKNAMES:
        first = NICKNAMES[first]
    elif rng.random() < 0.25:
        first = _typo(first, rng)

    if rng.random() < 0.20:
        last = _typo(last, rng)

    # Different email at the same organisation, or a typo'd local part.
    if rng.random() < 0.35:
        local, _, domain = email.partition("@")
        if rng.random() < 0.5:
            email = f"{local}@{rng.choice(EMAIL_DOMAINS)}"
        else:
            email = f"{_typo(local, rng)}@{domain}"

    # Phone formatting differences are extremely common across systems.
    if rng.random() < 0.45:
        digits = "".join(ch for ch in phone if ch.isdigit())
        style = rng.choice(["plain", "dashes", "parens", "spaced"])
        if style == "plain":
            phone = digits
        elif style == "dashes":
            phone = "-".join([digits[:2], digits[2:5], digits[5:8], digits[8:]])
        elif style == "parens":
            phone = f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"
        else:
            phone = f"+{digits[:2]} {digits[2:]}"

    # "Street" vs "St".
    if rng.random() < 0.40:
        for full, abbrev in STREET_TYPES:
            if address.endswith(full):
                address = address[: -len(full)] + abbrev
                break

    if rng.random() < 0.15:
        city = city.upper()

    # Missing data: a field the second system never captured.
    if rng.random() < 0.12:
        email = ""
    if rng.random() < 0.10:
        phone = ""

    return Person(
        entity_id=person.entity_id,
        first_name=first, last_name=last, email=email, phone=phone,
        address=address, city=city, country=person.country,
        signup_date=person.signup_date,
    )


def generate(
    n_entities: int = 4000,
    duplicate_rate: float = 0.18,
    seed: int = 42,
    include_ground_truth: bool = False,
) -> pd.DataFrame:
    """Build the dataset.

    Args:
        n_entities: Number of distinct real people.
        duplicate_rate: Fraction of them that appear more than once.
        seed: Fixed so the same input always produces the same file.
        include_ground_truth: Keep ``true_entity_id``. Tests need it; the demo
            file ships without it so the app has nothing to cheat with.
    """
    rng = random.Random(seed)
    rows: list[dict] = []
    record_id = 1

    for entity_id in range(1, n_entities + 1):
        person = _make_person(entity_id, rng)
        variants = [person]

        if rng.random() < duplicate_rate:
            # Most duplicated entities appear twice; a few appear more.
            extra = rng.choices([1, 2, 3], weights=[0.75, 0.20, 0.05])[0]
            variants.extend(_corrupt(person, rng) for _ in range(extra))

        for variant in variants:
            rows.append(
                {
                    "customer_id": f"CUST-{record_id:06d}",
                    "first_name": variant.first_name,
                    "last_name": variant.last_name,
                    "email": variant.email,
                    "phone": variant.phone,
                    "address": variant.address,
                    "city": variant.city,
                    "country": variant.country,
                    "signup_date": variant.signup_date,
                    "true_entity_id": variant.entity_id,
                }
            )
            record_id += 1

    # Shuffle so duplicates are not adjacent, as they never are in real data.
    rng.shuffle(rows)
    df = pd.DataFrame(rows)
    if not include_ground_truth:
        df = df.drop(columns=["true_entity_id"])
    return df


def expected_duplicate_records(
    n_entities: int = 4000, duplicate_rate: float = 0.18, seed: int = 42
) -> int:
    """Ground-truth count of removable rows: total rows minus distinct people."""
    df = generate(n_entities, duplicate_rate, seed, include_ground_truth=True)
    return len(df) - df["true_entity_id"].nunique()


def write_demo_csv(path: str, **kwargs) -> str:
    generate(**kwargs).to_csv(path, index=False)
    return path


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Generate the messy demo dataset")
    parser.add_argument("-o", "--out", default="demo_customers.csv")
    parser.add_argument("-n", "--entities", type=int, default=4000)
    parser.add_argument("--rate", type=float, default=0.18)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--ground-truth", action="store_true")
    args = parser.parse_args()

    frame = generate(args.entities, args.rate, args.seed, args.ground_truth)
    frame.to_csv(args.out, index=False)
    distinct = args.entities
    print(f"Wrote {len(frame):,} rows ({distinct:,} real people, "
          f"{len(frame) - distinct:,} duplicate records) to {args.out}")
