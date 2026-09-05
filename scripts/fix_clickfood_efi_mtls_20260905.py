from pathlib import Path

FILES = [
    "supabase/functions/efi-pix-create/index.ts",
    "supabase/functions/efi-pix-status/index.ts",
    "supabase/functions/efi-pix-refund/index.ts",
    "supabase/functions/efi-pix-cancel/index.ts",
    "supabase/functions/efi-pix-setup/index.ts",
]

for filename in FILES:
    path = Path(filename)
    if not path.exists():
        continue
    text = path.read_text()
    original = text

    # Formas em que o material TLS já está em variáveis cert/key.
    text = text.replace(
        "Deno.createHttpClient({cert,key})",
        "Deno.createHttpClient({certChain:cert,privateKey:key})",
    )

    # Formas inline usadas por status/refund/cancel.
    text = text.replace(
        'Deno.createHttpClient({cert:tlsSecret("EFI_PIX_CERT_PEM","EFI_PIX_CERT_B64"),key:tlsSecret("EFI_PIX_KEY_PEM","EFI_PIX_KEY_B64")})',
        'Deno.createHttpClient({certChain:tlsSecret("EFI_PIX_CERT_PEM","EFI_PIX_CERT_B64"),privateKey:tlsSecret("EFI_PIX_KEY_PEM","EFI_PIX_KEY_B64")})',
    )
    text = text.replace(
        'Deno.createHttpClient({cert:dec("EFI_PIX_CERT_B64")??required("EFI_PIX_CERT_PEM"),key:dec("EFI_PIX_KEY_B64")??required("EFI_PIX_KEY_PEM")})',
        'Deno.createHttpClient({certChain:dec("EFI_PIX_CERT_B64")??required("EFI_PIX_CERT_PEM"),privateKey:dec("EFI_PIX_KEY_B64")??required("EFI_PIX_KEY_PEM")})',
    )

    if text != original:
        path.write_text(text)
        print(f"corrigido: {filename}")
    else:
        print(f"sem alteração: {filename}")
