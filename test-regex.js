const expr = /'[^']*'?|[\w:_-]{2,}/;
const source = "(?:" + expr.source + ")$";
const re = new RegExp(source);
console.log("Regex:", re);
console.log("'Body struc".search(re)); // Should be 0
console.log("and Body".search(re)); // Should be 4
console.log("Class".search(re)); // Should be 0
