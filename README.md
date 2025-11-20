# Prompt Station

A single landing page that unifies the three prompt tools in this repository:

- Prompt Enhancer (`/prompt-enhancer/`)
- LLM Chain Builder (`/llm-open-chain/`)
- PromptForge (`/prompt-forge/`)

## Use it

1) Open `index.html` from the repo root in a browser.  
2) Pick an app card to launch it inline or open the full tab.  
3) The “Inline workspace” frame loads the actual app files, so service workers, manifests, and offline behavior remain intact.

## Notes

- Routes for each app stay the same; the landing page is purely a launcher/menu.  
- Everything is static—no build step required.  
- If you deploy the suite, publish the repo root so `/index.html` is served alongside the three app directories.
# prompt-station
