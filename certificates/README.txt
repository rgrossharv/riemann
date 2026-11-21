Our certificate: To be uploaded

The complete local check has not finished. No successful certificate is claimed.

Run the independently downloadable verify_proof.py to create your own
certificate.json, statistics.json, theorem-certificate.lean, and hashed logs.
A certificate records source/toolchain identity, actual command exit codes,
the theorem axiom audit, timing, and whether an incremental cache was reused.
Its SHA-256 digest detects changes to that report; it is not an identity signature.

To share an independently generated report, submit it through a GitHub pull
request. The repository owner reviews submissions before publication; public
website visitors cannot edit the site or upload files to the server.

Once our successful report is available, the owner can place it at
certificates/ours.json and push main. The Pages build then exposes it only if
the source fingerprint, report digest, completion status, and axiom audit pass
the publication checks. Otherwise the website says "To be uploaded".
