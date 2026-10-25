// Print instructions, containing function and decompiler output for addresses.
// Usage: -postScript DumpAt.java 0x432fa1 0x49f68c
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.mem.Memory;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;

public class DumpAt extends GhidraScript {
    @Override
    public void run() throws Exception {
        DecompInterface decompiler = new DecompInterface();
        decompiler.openProgram(currentProgram);
        for (String arg : getScriptArgs()) {
            Address address = toAddr(arg);
            println("=== " + address + " ===");
            Function function = getFunctionContaining(address);
            if (function == null) {
                function = getFunctionBefore(address);
            }
            if (function == null) {
                println("  no function");
            } else {
                println("  function " + function.getName() + " @ " + function.getEntryPoint());
                Instruction instruction = getInstructionAt(address);
                if (instruction != null) println("  instruction: " + instruction);
                DecompileResults result = decompiler.decompileFunction(function, 120, monitor);
                if (result.decompileCompleted() && result.getDecompiledFunction() != null) {
                    println(result.getDecompiledFunction().getC());
                } else {
                    println("  decompile failed: " + result.getErrorMessage());
                }
            }

            Memory memory = currentProgram.getMemory();
            byte[] raw = new byte[4];
            if (memory.getBytes(address, raw) == 4) {
                int value = ByteBuffer.wrap(raw).order(ByteOrder.LITTLE_ENDIAN).getInt();
                println("  dword " + String.format("0x%08x", value));
            }
        }
    }
}
