fetch('http://0.0.0.0:3000/api/telemetry')
  .then(r => r.text())
  .then(text => console.log('Response:', text))
  .catch(e => console.error(e));
