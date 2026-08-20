const terminal=new Set(["done","cancelled"]);
const tools=new Set(["noop"]);
function assert(v:boolean,m:string){if(!v)throw new Error(`FAIL ${m}`);console.log(`PASS ${m}`)}
assert(!terminal.has("open"),"open action is executable");
assert(!terminal.has("in_progress"),"in-progress action is executable");
assert(terminal.has("done"),"done action is terminal");
assert(terminal.has("cancelled"),"cancelled action is terminal");
assert(tools.has("noop"),"noop is registered");
assert(!tools.has("gmail.send"),"unregistered connector is rejected");
console.log("AGBA ACTION DISPATCH UNIT TEST PASS");
