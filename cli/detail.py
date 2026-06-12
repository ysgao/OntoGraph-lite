#!/usr/bin/env python3
import re, sys

concept_id = sys.argv[1]
owl_file   = sys.argv[2]

def split_args(s):
    depth, cur, parts = 0, [], []
    for ch in s:
        if ch == '(': depth += 1
        elif ch == ')': depth -= 1
        if ch == ' ' and depth == 0:
            if cur: parts.append(''.join(cur)); cur = []
        else:
            cur.append(ch)
    if cur: parts.append(''.join(cur))
    return parts

def parse(s, labels):
    s = s.strip()
    def resolve(iri):
        m = re.match(r':(\d+)$', iri)
        if m: return labels.get(m.group(1), f'[{m.group(1)}]')
        m = re.match(r'<http://snomed\.info/id/(\d+)>', iri)
        return labels.get(m.group(1), f'[{m.group(1)}]') if m else iri
    for kw, sym in [('EquivalentClasses','≡'),('SubClassOf','⊑'),
                    ('SubObjectPropertyOf','⊑'),('TransitiveObjectProperty','transitive'),
                    ('ReflexiveObjectProperty','reflexive')]:
        if s.startswith(kw + '('):
            inner = s[len(kw)+1:-1].strip()
            parts = split_args(inner)
            if kw in ('TransitiveObjectProperty','ReflexiveObjectProperty'):
                return f'{parse(parts[0], labels)} is {sym}'
            return f'{parse(parts[0], labels)} {sym} {parse(parts[1], labels)}'
    if s.startswith('ObjectIntersectionOf('):
        parts = split_args(s[len('ObjectIntersectionOf('):-1])
        return ' ⊓ '.join(parse(p, labels) for p in parts)
    if s.startswith('ObjectUnionOf('):
        parts = split_args(s[len('ObjectUnionOf('):-1])
        return ' ⊔ '.join(parse(p, labels) for p in parts)
    if s.startswith('ObjectSomeValuesFrom('):
        parts = split_args(s[len('ObjectSomeValuesFrom('):-1])
        return f'∃ {parse(parts[0], labels)} . {parse(parts[1], labels)}'
    if s.startswith('ObjectAllValuesFrom('):
        parts = split_args(s[len('ObjectAllValuesFrom('):-1])
        return f'∀ {parse(parts[0], labels)} . {parse(parts[1], labels)}'
    if s.startswith('ObjectComplementOf('):
        return f'¬{parse(s[len("ObjectComplementOf("):-1], labels)}'
    if s.startswith('ObjectHasValue('):
        parts = split_args(s[len('ObjectHasValue('):-1])
        return f'∃ {parse(parts[0], labels)} . {{{parse(parts[1], labels)}}}'
    return resolve(s)

# pass 1: extract concept block
block_lines = []
in_block = False
saw_content = False
with open(owl_file) as f:
    for line in f:
        if f'snomed.info/id/{concept_id}>' in line and '# Class:' in line:
            in_block = True
            continue
        if in_block:
            if line.strip() == '':
                if saw_content: break
                continue
            saw_content = True
            block_lines.append(line.rstrip())

# collect annotations, axioms, all IRIs from concept block
annots, axioms, gci_axioms, all_iris = {}, [], [], set()
for line in block_lines:
    iri_pat = r'(?::' + concept_id + r'|<http://snomed\.info/id/' + concept_id + r'>)'
    m = re.search(r'AnnotationAssertion\((?:rdfs:label|[^)]*prefLabel)[^"]*' + iri_pat + r'\s+"([^"]+)"@en\)', line)
    if m:
        prop = 'skos:prefLabel' if 'prefLabel' in line else 'rdfs:label'
        annots.setdefault(prop, m.group(1))
    m = re.search(r'AnnotationAssertion\([^)]*altLabel[^"]*' + iri_pat + r'\s+"([^"]+)"@en\)', line)
    if m: annots.setdefault('skos:altLabel', m.group(1))
    if re.match(r'\s*(EquivalentClasses|SubClassOf)\(', line):
        axioms.append(line.strip())
    for iri in re.findall(r'<http://snomed\.info/id/(\d+)>', line):
        all_iris.add(iri)
    for iri in re.findall(r':(\d{6,})', line):
        all_iris.add(iri)

# scan whole file for GCI axioms: SubClassOf(ComplexExpr <concept_IRI>)
# these live outside the concept block — concept IRI is on the right-hand side
iri_variants = (f':{concept_id}', f'<http://snomed.info/id/{concept_id}>')
with open(owl_file) as f:
    for line in f:
        stripped = line.strip()
        if (stripped.startswith('SubClassOf(') and
                any(v in stripped for v in iri_variants)):
            inner = stripped[len('SubClassOf('):-1].strip()
            args = split_args(inner)
            if len(args) == 2 and args[1] in iri_variants:
                gci_axioms.append(stripped)
                for iri in re.findall(r'<http://snomed\.info/id/(\d+)>', stripped):
                    all_iris.add(iri)
                for iri in re.findall(r':(\d{6,})', stripped):
                    all_iris.add(iri)

# pass 2: resolve all IRIs (one scan)
labels = {}
with open(owl_file) as f:
    for line in f:
        m = re.search(r'AnnotationAssertion\((?:rdfs:label|[^)]*prefLabel)[^"]*'
                      r'(?::(\d+)|<http://snomed\.info/id/(\d+)>)\s+"([^"]+)"@en\)', line)
        if m:
            cid = m.group(1) or m.group(2)
            if cid in all_iris and cid not in labels:
                labels[cid] = m.group(3)
        if len(labels) == len(all_iris): break

# output
concept_label = annots.get('rdfs:label', annots.get('skos:prefLabel', f'[{concept_id}]'))
print(f'\n{concept_label} ({concept_id})\n')
print('Annotations:')
for prop, short in [('rdfs:label','label'),('skos:prefLabel','prefLabel'),('skos:altLabel','altLabel')]:
    if prop in annots: print(f'  {short:<12} "{annots[prop]}"@en')
if axioms:
    print('\nAxioms:')
    seen = set()
    for ax in axioms:
        human = parse(ax, labels)
        if human in seen:
            print(f'  (derived from equivalence)')
        else:
            print(f'  {human}')
            seen.add(human)
if gci_axioms:
    print('\nGCI Axioms:')
    for ax in gci_axioms:
        print(f'  {parse(ax, labels)}')
