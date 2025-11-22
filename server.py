from mcp.server.fastmcp import FastMCP
import subprocess

# Initialize the "HaswellOps" server
mcp = FastMCP("HaswellOps")

@mcp.tool()
def build_haswell_kernel(branch: str = "main") -> str:
    """
    Dispatches a CachyOS BORE kernel build optimized for Haswell.
    Removes Spectre/Meltdown mitigations but KEEPS USB/FS drivers.
    """
    cmd = [
        "gh", "workflow", "run", "build-kernel.yml",
        "--repo", "schnicklfritz/lite-remote-builder",
        "-f", f"branch={branch}",
        "-f", "opt_level=O3"
    ]
    
    try:
        # Trigger the remote action
        subprocess.run(cmd, check=True)
        return "🚀 Build Dispatched! The cloud is now compiling your Haswell kernel."
    except subprocess.CalledProcessError as e:
        return f"❌ Failed to dispatch build. Ensure 'gh auth login' is active. Error: {e}"

if __name__ == "__main__":
    mcp.run()
