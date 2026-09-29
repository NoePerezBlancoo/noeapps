# ChatGPT conversation handoff

Staging-only workflow:

1. CRM marks a Catalog request as ready for ChatGPT.
2. A read-only MCP endpoint exposes only sanitized business/design context.
3. ChatGPT uses the connected GitHub app to write static HTML + manifest into the private `noeapps-web-catalog` repository.
4. One lightweight Railway service serves all generated drafts.
5. CRM detects the manifest, Noé reviews and validates a version, then explicitly publishes it.
6. Public preview is proxied by Catalog and receives the NoeApps WhatsApp lead gate.

This flow does not call the OpenAI API. Production remains unchanged until explicit authorization.
