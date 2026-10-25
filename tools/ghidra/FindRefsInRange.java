// Print all references whose destination falls inside an address range.
// Usage: -postScript FindRefsInRange.java 0x48f000 0x490600
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.ReferenceIterator;

public class FindRefsInRange extends GhidraScript {
    @Override
    public void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length < 2) {
            println("usage: FindRefsInRange.java <start> <end>");
            return;
        }
        Address start = toAddr(args[0]);
        Address end = toAddr(args[1]);
        println("=== refs into " + start + ".." + end + " ===");
        ReferenceIterator it = currentProgram.getReferenceManager().getReferenceIterator(start);
        while (it.hasNext()) {
            Reference ref = it.next();
            Address to = ref.getToAddress();
            if (to.compareTo(end) > 0) break;
            Function fn = getFunctionContaining(ref.getFromAddress());
            println("  from " + ref.getFromAddress() + " -> " + to + "  " + ref.getReferenceType()
                + (fn == null ? "" : "  in " + fn.getName() + " @ " + fn.getEntryPoint()));
        }
    }
}
