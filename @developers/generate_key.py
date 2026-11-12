#!/usr/bin/env python3
import os
import secrets
import base64

def generate_credentials():
    # 16-byte salt is standard for secure PBKDF2/cryptographic salts
    salt_bytes = secrets.token_bytes(16)
    # Encode as Base64 (similar to the format used in .env: l5Jg5l+jD3BrMfsR40NTtQ==)
    salt_b64 = base64.b64encode(salt_bytes).decode('utf-8')
    
    # Generate a strong 32-character alphanumeric password for key derivation
    password = secrets.token_urlsafe(24)
    
    print("=== Generated Encryption Keys ===")
    print(f"VAPI_ENCRYPTION_SALT={salt_b64}")
    print(f"VAPI_ENCRYPTION_PASSWORD={password}")
    print("=================================")

if __name__ == "__main__":
    generate_credentials()
