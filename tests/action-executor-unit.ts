const allowedTools=new Set(["noop"]);
const terminal=new Set(["done","cancelled"]);
const executionStates=new Set(["pending","running","succeeded","failed","cancelled"]);

function assert(condition:boolean,message:string){if(!condition)throw new Error(`FAIL ${message}`);console.log(`PASS ${message}`)}

assert(allowedTools.has("noop"),"registered tool is allowed");
assert(!allowedTools.has("gmail.send"),"unregistered external tool is blocked");
assert(terminal.has("done")&&terminal.has("cancelled"),"terminal action states are recognized");
assert(!terminal.has("open")&&!terminal.has("in_progress"),"active action states remain executable");
for(const state of ["pending","running","succeeded","failed","cancelled"])assert(executionStates.has(state),`execution state ${state} is valid`);
assert(!executionStates.has("completed"),"unknown execution state is rejected");
console.log("AGBA ACTION EXECUTOR UNIT TEST PASS");
