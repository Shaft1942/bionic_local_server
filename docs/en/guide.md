[English README](../../README.en.md) · [Accueil français](../../README.md) · [All guides / Tous les guides](../README.md)

# Bionic Mobile 2.5.0 — user guide

The companion runs on your PC and serves a web interface to your phone or computer. Bionic runs the chat models; optional ComfyUI generates images. Keep the PC and the required servers running while you use it. Native Bionic histories remain read-only; replies through the companion are saved in separate web chats.

## Install and connect

You need Node.js **24 or later**, Bionic with a working local model, and a writable installation folder. Docker is unnecessary. The server has no npm runtime dependencies to install. Python is optional for document extraction and approved Python scripts.

1. Download the distribution ZIP and `SHA256SUMS.txt` for the same version from [Releases](https://github.com/Shaft1942/bionic_local_server/releases). Extract the whole archive into a user folder, outside `Program Files`.
2. Run **Installer.cmd** on Windows. The assistant uses French labels. Choose the destination and an existing Node.js installation, or approve the optional download of an official portable copy.
3. Enable Bionic’s local model API in **API des modèles locaux**. Enter the address shown there in the installer. The installer accepts an address ending in `/v1`; **Tester l’API** lists models without generating or unloading anything.
4. Install and start the companion. If you want phone access, allow the optional Windows firewall rule on a trusted private network.
5. Open **ACCES-PRIVE.txt** in the installed folder. It contains your personal access code and the current PC and phone addresses. Open the PC address first, then enter the code.
6. Connect the phone to the same local network and open its listed address with the exact protocol and port. `localhost` on the phone means the phone, not the PC. If only the PC connects, check the Windows private-network setting and run **Autoriser-reseau.cmd** if needed.

**Demarrer.cmd** starts the companion, **Arreter.cmd** stops it, and **Relancer.cmd** restarts it. **Deconnecter-appareils.cmd** signs out all browser sessions without stopping work; knowing the code still allows reconnection unless device certificates are also required. **Diagnostic.cmd** runs bounded checks without generating a response.

For a manual installation, copy `config.example.json` to `config.local.json` and set `apiUrl` to your Bionic API base address without the final `/v1`. Run `npm start` from the extracted folder. The companion port defaults to `8769`; use the address actually listed for your installation. Do not expose Bionic’s API to the network for this purpose. See [Configuration](../configuration.md) (French) for custom paths and ports.

On macOS and Linux, use `npm start` and configure paths and firewall rules yourself. The Windows launchers and setup assistant do not apply; the complete workflow on those systems has not been qualified.

DOCX and XLSX text extraction needs Python 3.10+. PDF extraction additionally needs `pypdf`, installable with `python -m pip install -r requirements.txt` using the configured Python interpreter. Without extraction, documents remain stored and downloadable. Scanned PDFs do not receive OCR.

## Interface language

Open **Settings → Language and drafts → Interface language** and select English or Français. This changes interface labels and built-in help immediately. The choice is saved in this browser for this origin: a different host, port, protocol or browser has its own preference.

On first access, a supported browser language is selected, including recognized regional variants. The fallback is French. If browser storage is blocked, the choice still works in the current tab and settings report that it could not be saved.

**Language selection does not translate or rewrite messages, model responses, prompts, filenames or file contents.** Ask the model to respond in your preferred language. External engine errors, release notes and Windows utilities retain their source language. The detailed French guides remain available from the [documentation index](../README.md); translation contributions are described in [Internationalisation](../internationalisation.md).

## Projects and conversations

Select a project and open an existing chat, or create a new one. Replying to a native Bionic conversation creates a separate web continuation using a bounded text projection of its history. It does not copy every internal action or attachment or write back to the original history.

In **Manage projects**, create a local project or choose **Adopt the current Bionic project**. Preview the available folders and explicitly select which ones may be accessed and edited before confirming. Adoption keeps the project identifier and does not modify Bionic’s native history. File tools still follow their own project boundaries and message permissions.

Chat options let you rename a conversation or move it to another project, including **No project**. Moving changes its classification, not the location of project files or deliverables. Unsent file references are removed and file/script permissions are disabled after a move; attach files and set permissions again in the destination. Without a project, file tools, imports and scripts are unavailable; public web and images remain separate choices.

A native chat deletion hides it only in the companion. Deleting a web chat has no undo in the interface. Saved deliverable copies remain available after their source chat is deleted. Keep private backups if you need to recover deleted conversations.

Branch a whole chat from **Tools**, or branch through a selected message in its options or assistant turn details. Branches have independent histories but share their project files. Past tools are not replayed. Check the new branch’s permissions before continuing; Internet and scripts start disabled.

Choose the model and reasoning effort when supported. The response limit can be set for this chat or as a model default; its effective value is always limited by the available context. Vision attachments need a model marked **Vision**. Tool support depends on the model and is not a guarantee that it will choose the correct action.

You can queue a follow-up message or open another chat while a response runs. Requests capture the selected model, permissions, attachments and image choices when accepted. Closing the browser does not stop accepted work. Reopen it to recover the current state while the PC and servers stay active; a server restart can interrupt work and does not automatically replay pending messages.

Assistant turn details provide tool results, generation measurements and the context used. Save useful outputs as deliverables. Optional retained drafts store unsent message text in this browser for 1 hour, 24 hours or 7 days; attachments and editor contents are not durably saved with that text. Signing out clears the local draft copies.

## Files and permissions

**Project files** lets you browse and download files, edit supported text files, and access deliverables and project trash. Imports are copied into `Imports telephone/` in the project working folder without overwriting existing names. Importing and attaching are separate actions; removing an attachment does not remove an imported file.

| Action | Limit |
| --- | --- |
| Import from a device | 20 MB per file, 10 files per selection |
| Message attachments | Up to 4 |
| Vision image attachment | PNG, JPEG or WebP, up to 6 MB |
| Download a PC file | Up to 64 MB |
| Edit a text file | Up to 1 MB |

PDF, DOCX and XLSX previews use extracted text; direct file tools do not edit their original formats. You can select a useful text passage before attaching it. Attachments are copied when sent, so a later change to the project file does not silently change the accepted request.

The message **Tools → File tools** control offers **None**, **Read** and **Write**. **Write is the default for a new regular chat.** Allowed direct writes are immediate, without approval for each file. Choose Read for investigation or None when file access is unnecessary. The model does not automatically receive your entire library: direct reads are bounded excerpts, and explicit attachments have a separate context budget.

Supported changes keep previous versions; file removal uses recoverable project trash. Restoration checks for conflicts. These safeguards do not replace independent backups and do not undo changes made by arbitrary scripts. Check action results and the actual file rather than relying only on the model’s description.

Public web access is enabled for new conversation choices; explicit disabled settings remain unchanged. Scripts remain disabled by default. Images are enabled for new choices when the configured ComfyUI API is detected and available; this does not start a generation. Optional per-request web approval shows the exact search or URL before transmission; declined or expired requests are not sent by those tools. Searches and visited pages disclose their query or URL to the relevant services.

Scripts may use Python, Node.js or PowerShell. Each proposal displays its exact code and working directory and waits for **Run this script** or **Reject**. **An approved script runs with the PC account’s permissions, can act outside the project and can access the network: it is not a sandbox.** File and web tool permissions do not restrict it. Stopping a script or encountering an error does not undo previous changes. An approval expires after ten minutes or when abandoned by a server restart.

## Images and memory

1. Start ComfyUI. Open **Settings → Images and ComfyUI** and enter an address reachable from the companion PC. **Find server** checks the entered address and known local ports; it does not scan the whole network.
2. Check the connection, required nodes and exact model filenames for the chosen Krea 2 Turbo or HassakuXL profile. Testing does not render, download weights or install nodes. The supplied workflows are fixed; the graph currently open in ComfyUI is not used.
3. Choose optional cleanup, enable ComfyUI and save. Each profile has two optional LoRA slots. A LoRA appearing in the catalogue does not prove compatibility with the selected model.
4. In the message **Tools** menu, allow image generation, choose the image model and **Images per request** from **1 to 5**, then describe what you want to a model capable of tool calls. A series prepares its prompts in one tool call and renders images in order. The shared queue accepts at most twelve active images, with one submission to ComfyUI at a time.

**Generate this prompt directly** submits a single image using your exact typed prompt without chat-model preparation. It does not use attachments. From a native conversation it creates a separate web chat.

Choose **Text model during images** in Tools for the next request, or set the installation default in image settings:

| Choice | What happens |
| --- | --- |
| **Keep the text model** | Other chats can respond during rendering. Both tasks may slow down through GPU or memory contention. |
| **Respond between images** | The text model stays loaded. Pending text responses run between images after the current image finishes; long text responses delay the next image. |
| **Unload before images** | Existing text inference finishes, then loaded Bionic text models are unloaded. New text responses from this companion wait for the batch to finish; the next response reloads its model. |

**Global settings** uses the saved default; another selection creates an override for that request. Choices are captured when the message is accepted. Changing global image settings requires an empty queue. Coordination covers this companion’s requests, not other applications or instances, and does not guarantee a speed improvement.

Optional **Free ComfyUI models after each image** is separate: it runs after each image, including images in a series, and does not unload Bionic’s chat model. To enable it, download the supplied memory module from settings, copy `free_memory_after_workflow.py` into the active ComfyUI instance’s `custom_nodes`, then restart that instance after its work finishes. Leave cleanup disabled to work without this module. Reloading weights may slow the next render; cleanup is not a systematic unload before every prompt.

Each image has a status card. You can cancel one still queued locally before submission begins; the other images continue. This does not send a global interrupt to ComfyUI. Retry a terminal image with **Retry · same seed** or **Retry · new seed** to create a new job in the source chat with the captured recipe. Active or uncertain submissions cannot be retried; a changed engine address or workflow requires an ordinary new generation.

The gallery offers a series ZIP. **Deliverables → Generation** collects successful project images across chats, including saved copies whose source chat was deleted. Select up to **20 images** for a ZIP, within 32 MiB per image and 128 MiB per archive. The ZIP includes PNGs and a manifest with prompts, seeds, model, LoRAs and checksums.

An uncertain submission is never automatically repeated. Check ComfyUI and its outputs first, then use queue recovery only after confirming the engine queue is empty. Stopping the chat response does not globally stop ComfyUI work. See the detailed [ComfyUI guide](../comfyui.md) (French).

## Servers on the PC

On the companion PC, open **Settings → Servers on the PC** and configure the engine. Detect an installation or choose its folder, review the proposed paths, confirm dedicated use and save. Advanced paths remain available for unusual installations. Setup validates and reloads the profile without downloading or starting an engine. **Configurer-serveurs.cmd** remains a local alternative. Phones can control prepared engines, but cannot select executables or save paths.

- **Bionic:** the profile selects the official `lms.exe`, Bionic’s existing control file and optionally `Bionic.exe` for a cold start. Stop shuts down the selected HTTP API; it does not close the Desktop app. Status checks do not deliberately load a model.
- **ComfyUI:** select its Python interpreter, `main.py` and working folder. The companion manages the Python instance it starts. An existing Comfy Desktop or externally started instance is not adopted or closed automatically.

Both managed APIs must be local to the companion PC. An existing remote ComfyUI connection remains usable for images within its existing network rules, but the launcher only observes it. Profiles do not change the companion’s configured API addresses.

Start is manual. Stop and restart require confirmation and refuse known active or uncertain work. Process running, API ready and model loaded are distinct states. An operation accepted on the PC continues when you close settings; reconnecting checks its receipt rather than replaying the command. If its outcome remains unknown, check on the PC before trying again. The supported setup assumes engines dedicated to the companion; external clients can bypass its coordination. See [Local services](../local-services.md) (French).

## Secure access

Use a trusted local network, with no router port forwarding to the companion. There are no separate user accounts or isolation between authorized devices. HTTP sends the access code, messages and files without transport encryption.

In **Settings → Security and access**, prepare HTTPS using the exact hostname or IP used by the phone. Download the public authority certificate `bionic-autorite.crt`, compare its full SHA-256 fingerprint with the value shown on the PC through a trusted channel, and install it as a trusted certificate authority on the device. Downloading alone is insufficient.

- **Android:** in system security settings, install a **CA certificate**. The Wi-Fi certificate menu serves another purpose; wording varies by manufacturer.
- **iPhone/iPad:** install the downloaded profile, then enable full trust under **General → About → Certificate Trust Settings**.
- **Windows:** import the authority into **Trusted Root Certification Authorities** for the browser’s user account.

Open the secure connection check and confirm only when there is no certificate warning. Return to the normal HTTPS address and sign in again. You may then add the app to the home screen using the browser’s installation menu. This still requires the PC to stay running.

An optional device `.p12` certificate and its password are for mTLS, a later step that requires each device to present an authorized private identity. They are not needed for HTTPS alone. **Never share a `.p12`, its password or the authority’s private key in a support request.** The private authority key remains on the PC. For access recovery, return to the PC and use **Certificats.cmd** following the [certificate guide](../certificats-utilisation.md) (French); do not delete security data to bypass recovery.

## Backup and updates

In **Settings → Maintenance → Updates**, choose Stable or Beta and check available releases. This choice applies to the PC installation and all connected devices. Downloads and installation require the offered version to pass checks, and installation needs your explicit approval. Active or uncertain work may block it. Git checkouts refuse automatic installation and must be updated through Git.

For a consistent private backup, wait for responses, images and scripts to finish, reject pending script proposals, and stop the companion. Save `data/`, `config.local.json`, any local launcher profile, and `ACCES-PRIVE.txt` privately. Back up project folders and Bionic data separately: they may live outside the companion. Keep separately configured environment secrets through your own private mechanism.

A full `data/` backup includes the private certificate authority and device identities; protect it as sensitive identity material. Restoring an older full backup may restore old access rights. Browser language, retained drafts and reading indicators are local to each browser and are not part of the server backup. Runtime process receipts are not proof that a server is still controlled after restoration.

For a manual update, retain a stopped copy of the old installation and its private backup, extract the new distribution into a separate folder, then follow [Backup and updates](../sauvegarde-mise-a-jour.md) (French) to transfer configuration and data. Stop the old server before starting the new one. Never replace your private data with files from a public archive. Sign in again using the installation’s access code after restart.

If a connection fails, verify the exact URL, port and protocol, PC power state, server status and local firewall. If an operation is uncertain, check the real files or engine state before repeating it. Report the software versions and a reproduction using fictitious data; never attach your access code, local configuration, private certificates or personal chats. More detail: [Troubleshooting](../depannage.md) and [Security](../../SECURITY.md) (French).
