// List callers/references for one or more function entry points.
// Usage: -postScript FindCallers.java 0x432dc0
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.symbol.Reference;

public class FindCallers extends GhidraScript {
    @Override
    public void run() throws Exception {
        for (String arg : getScriptArgs()) {
            Address address = toAddr(arg);
            Function target = getFunctionAt(address);
            if (target == null) target = getFunctionContaining(address);
            println("=== refs to " + arg + (target == null ? "" : " (" + target.getName() + ")") + " ===");
            for (Reference ref : getReferencesTo(address)) {
                Function caller = getFunctionContaining(ref.getFromAddress());
                println("  " + ref.getFromAddress() + "  " + ref.getReferenceType()
                    + (caller == null ? "" : "  in " + caller.getName() + " @ " + caller.getEntryPoint()));
            }
        }
    }
}
