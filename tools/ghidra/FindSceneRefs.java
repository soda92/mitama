// Ghidra headless helper: find ASCII strings, pointer occurrences and xrefs.
//
// Usage:
//   analyzeHeadless <project> <name> -process mitama_dvd.exe \
//     -scriptPath tools/ghidra -postScript FindSceneRefs.java eyk2_03.txt eoa4_07.txt
//
// This is intentionally small and generic so the same projection can be used
// for scene names, command names, archive names, or battle identifiers.
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.mem.Memory;
import ghidra.program.model.symbol.Reference;

import java.nio.charset.StandardCharsets;

public class FindSceneRefs extends GhidraScript {
    private Address findNext(Memory memory, Address start, byte[] needle) throws Exception {
        return memory.findBytes(start, needle, null, true, monitor);
    }

    private byte[] le32(long value) {
        return new byte[] {
            (byte) (value & 0xff),
            (byte) ((value >>> 8) & 0xff),
            (byte) ((value >>> 16) & 0xff),
            (byte) ((value >>> 24) & 0xff),
        };
    }

    private void printRefs(Address address) {
        Reference[] refs = getReferencesTo(address);
        if (refs.length == 0) {
            println("    (no direct xrefs)");
            return;
        }
        for (Reference ref : refs) {
            println("    xref " + ref.getFromAddress() + "  " + ref.getReferenceType());
        }
    }

    @Override
    public void run() throws Exception {
        String[] needles = getScriptArgs();
        if (needles.length == 0) {
            println("usage: FindSceneRefs.java <ascii-string> [...]");
            return;
        }
        Memory memory = currentProgram.getMemory();
        for (String needle : needles) {
            println("=== " + needle + " ===");
            byte[] bytes = needle.getBytes(StandardCharsets.US_ASCII);
            Address found = findNext(memory, currentProgram.getMinAddress(), bytes);
            while (found != null) {
                println("STRING @ " + found);
                printRefs(found);

                // A string in this executable is often reached through a
                // 32-bit pointer table entry rather than directly by code.
                Address pointer = findNext(memory, currentProgram.getMinAddress(), le32(found.getOffset()));
                while (pointer != null) {
                    println("  PTR32 @ " + pointer + " -> " + found);
                    printRefs(pointer);
                    pointer = findNext(memory, pointer.add(1), le32(found.getOffset()));
                }

                found = findNext(memory, found.add(1), bytes);
            }
        }
    }
}
