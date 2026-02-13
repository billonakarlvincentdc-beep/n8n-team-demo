require('http').get('http://localhost:3099/api/health', (r) => {
  let d = '';
  r.on('data', c => d += c);
  r.on('end', () => process.exit(r.statusCode === 200 ? 0 : 1));
}).on('error', () => process.exit(1));
