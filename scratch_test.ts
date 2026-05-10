const expr = "http://example.org/BodyStructure and (http://example.org/Laterality some http://example.org/Side)";
function getTopLevelNamedClasses(expr: string): string[] {
  let depth = 0;
  for (let i = 0; i < expr.length; i++) {
    const char = expr[i];
    if (char === '(') depth++;
    else if (char === ')') depth--;
    else if (depth === 0 && expr.startsWith(' or ', i)) return [];
  }
  
  const result: string[] = [];
  let currentConjunct = '';
  depth = 0;
  for (let i = 0; i < expr.length; i++) {
    const char = expr[i];
    if (char === '(') depth++;
    else if (char === ')') depth--;
    
    if (depth === 0 && expr.startsWith(' and ', i)) {
      result.push(currentConjunct.trim());
      currentConjunct = '';
      i += 4;
    } else {
      currentConjunct += char;
    }
  }
  if (currentConjunct) result.push(currentConjunct.trim());
  
  const namedClasses: string[] = [];
  for (const c of result) {
    if (!c.includes(' ') && !c.includes('(')) {
      namedClasses.push(c);
    }
  }
  return namedClasses;
}
console.log(getTopLevelNamedClasses(expr));
