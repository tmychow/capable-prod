import subprocess
import shlex


def execute_curl(curl_command: str) -> dict:
    """
    Execute a curl command provided as a string.

    Args:
        curl_command: Full curl command as a string

    Returns:
        dict with 'stdout', 'stderr', and 'returncode'
    """
    # Parse the command string into arguments
    args = shlex.split(curl_command)

    # Ensure it starts with curl
    if args[0] != "curl":
        args.insert(0, "curl")

    result = subprocess.run(
        args,
        capture_output=True,
        text=True,
    )

    return {
        "stdout": result.stdout,
        "stderr": result.stderr,
        "returncode": result.returncode,
    }


if __name__ == "__main__":
    import json

    # Health check
    cmd = "curl -X GET http://localhost:8000/health"
    response = execute_curl(cmd)
    print(f"Health: {response['stdout']}")

    # Login
    cmd = """curl -X POST http://localhost:8000/auth/login \
        -H "Content-Type: application/json" \
        -d '{"email": "kashyapanshulp@gmail.com", "password": "Cyb3rBlaze2004"}'
    """
    response = execute_curl(cmd)
    print(f"Login: {response['stdout']}")

    # Extract token from login response
    token = ""
    try:
        login_data = json.loads(response["stdout"])
        token = login_data.get("access_token", "")
    except json.JSONDecodeError:
        print("Failed to parse login response")

    # Get current user
    cmd = f"""curl -X GET http://localhost:8000/auth/me \
        -H "Authorization: Bearer {token}"
    """
    response = execute_curl(cmd)
    print(f"Current user: {response['stdout']}")

    # Create experiment (with auth)
    cmd = f"""curl -X POST http://localhost:8000/experiments \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer {token}" \
        -d '{{"name": "Peptide Synthesis Test", "organism_type": "E. coli", "peptides": ["ACDEFG", "HIJKLM"], "experiment_start": "09:00:00", "parameters": {{"temperature": 37, "duration": 24}}}}'
    """
    response = execute_curl(cmd)
    print(f"Create experiment: {response['stdout']}")

    # Get all experiments (with auth)
    cmd = f"""curl -X GET http://localhost:8000/experiments \
        -H "Authorization: Bearer {token}"
    """
    response = execute_curl(cmd)
    print(f"Experiments: {response['stdout']}")
