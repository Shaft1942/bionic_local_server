[Français](README.md) · [English](README.en.md)

# Canaé — local companion

**Canaé 2.6.0-beta.11** is the single frontend, including after an update from 2.5.0. New global chats have no project; titles can be edited inline and the management panel brings engines, models and images together. See the [beta.11 guide (French)](docs/beta11-usage.md). Compact controls, drafts, reasoning choices and tools remain available.

**Stable reference 2.5.0** · Chat with the models on your PC and access your projects from your phone’s browser over your local network.

The companion uses Bionic’s local API and can generate images through ComfyUI. This community project is independent of Bionic; Bionic, ComfyUI and their models are not included.

## What you can do

- Browse Bionic projects and conversations, then continue in a **separate web chat**, preserving the native histories.
- Create local projects, adopt a Bionic project with explicitly allowed folders, organize chats and branch conversations.
- Choose a model, reasoning effort and response limit; reconnect to running responses and queue follow-up messages.
- Attach documents or images, browse and edit text files, save deliverables and restore files from project trash.
- Allow file tools, public web access and scripts separately, approving the exact code before each script runs.
- Generate **1 to 5 images per request** with Krea 2 Turbo or HassakuXL, configure two LoRAs per profile and choose how text and image work share resources.
- Cancel an image still queued locally, retry with the same or a new seed, browse the gallery and download a ZIP.
- Start, stop or restart supported servers in **Settings → Servers on the PC**, after explicit setup on the PC.
- Use the interface and built-in help in **French or English**, with a language preference for each browser.

Bionic’s tools, MCP servers and skills are not inherited: the companion provides its own tools and permissions.

## Install on Windows

You need **Node.js 24 or later**, Bionic with its local API enabled, and a writable installation folder. Docker and npm dependency installation are not required to run the server.

1. Download `bionic-mobile-v….zip` and `SHA256SUMS.txt` for the same version from [Releases](https://github.com/Shaft1942/bionic_local_server/releases). Extract the entire archive. GitHub’s source archives may differ from the distribution package.
2. Run **Installer.cmd**. The Windows setup assistant lets you choose the folder, use an existing Node.js installation or download an official portable copy, and configure connections.
3. In **Bionic → API des modèles locaux**, enable the local model API and enter its address in setup. **Tester l’API** lists models without generating a response.
4. Install and start the companion. Firewall access is optional, requires Windows approval and is limited to the private network and local subnet.
5. Open **ACCES-PRIVE.txt** in the installed folder. Use the PC address and your personal access code, then open the phone address from the same local network.

See the [English guide](docs/en/guide.md) for detailed setup and `npm start`. **Python is optional**: it extracts DOCX/XLSX text, extracts PDF text with `pypdf`, and runs approved Python scripts. Scanned PDFs are not processed with OCR. Windows scripts and the installer retain their French names and labels.

## Choose a language

In **Settings → Language and drafts → Interface language**, choose Français or English. The interface changes immediately and saves the choice in this browser for the address in use. A different browser, port or HTTPS address has its own preference.

On first access, a supported browser language is used; otherwise, French is selected. **This setting does not translate your messages, model responses, prompts or files.** Ask the model for your preferred response language in your message. Engine diagnostics and Windows tools may retain their original language.

The [English guide](docs/en/guide.md) covers setup and everyday use. Other detailed guides are mainly in French. Translation contributors can use [Internationalisation](docs/internationalisation.md).

## Use images and manage servers

In **Settings → Images and ComfyUI**, enter the server address, check required models, then enable ComfyUI and save. The message **Tools** menu lets you choose the profile, **1 to 5 images** and the text model policy: **Keep the text model**, **Respond between images** or **Unload before images**. Each request keeps the choices captured when it was sent.

**Generate this prompt directly** creates a single image from your exact text without preparation by the chat model. Optional ComfyUI cleanup runs after each render; it is separate from unloading text models. See the [English image guide](docs/en/guide.md#images-and-memory).

Set up launching in **Settings → Servers on the PC**: detect an installation or choose its folder, review the proposed paths, and save. **Configurer-serveurs.cmd** remains a local alternative. The launcher manages the selected Bionic API and Python ComfyUI instances it controls; a reachable external instance is not automatically adopted. Stopping the Bionic server stops its API without closing the Desktop app. See [Servers on the PC](docs/en/guide.md#servers-on-the-pc).

## Permissions and access

Under **File tools**, **Write** is the initial choice for a new regular chat: allowed writes happen immediately without approval for each file. Choose **Read** or **None** when editing is unnecessary. Previous versions and project trash do not replace independent backups.

Web access is enabled for new choices without replacing an explicit disabled setting. Images are enabled when ComfyUI is detected and available. Scripts remain disabled by default. You can require approval for each search and URL. **Every script requires approval of its exact code, then runs with the PC account’s permissions: it is not a sandbox.** File permission profiles do not restrict an approved script.

The companion is intended for a **trusted local network**. HTTP does not encrypt the access code, messages or files. In **Settings → Security and access**, prepare HTTPS and optionally a certificate for each device using mTLS. Do not bypass certificate warnings or expose this port directly to the Internet.

There are no separate accounts or isolation between authorized users. Keep the access code, `data/`, local configuration, launcher profiles and identity backups private. See [Security and access](docs/en/guide.md#secure-access) and [SECURITY.md](SECURITY.md) (French).

## Update and back up

In **Settings → Maintenance → Updates**, choose Stable or Beta and check available releases. Installation requires approval and may be blocked by active or uncertain work. Git checkouts are updated using Git.

Before a manual update, wait for work to finish, stop the companion and back up its private data and project folders separately. A full `data/` backup includes the certificate identity and must be protected. Browser language and locally retained drafts are not part of the server backup.

See [Backup and updates](docs/en/guide.md#backup-and-updates) for the procedure.

## Documentation

| Need | Guide |
| --- | --- |
| Set up and use the companion in English | [English guide](docs/en/guide.md) |
| Browse all detailed guides | [Documentation index](docs/README.md) (French) |
| Configure images and servers | [Images and memory](docs/en/guide.md#images-and-memory) · [Servers on the PC](docs/en/guide.md#servers-on-the-pc) |
| Understand permissions and secure access | [Files and permissions](docs/en/guide.md#files-and-permissions) · [Secure access](docs/en/guide.md#secure-access) |
| Contribute translations or code | [Internationalisation](docs/internationalisation.md) · [Contributing](CONTRIBUTING.md) · [Development](docs/developpement.md) (French) |
| Review changes and prepare packages | [Changelog](CHANGELOG.md) · [Publication](docs/publication.md) (French) |

## Compatibility and license

The primary target is **Windows with Node.js 24+**. Reading Bionic projects depends on its internal formats and may require adaptation after an update. Starting with `npm start` is supported in the code on macOS and Linux, but the full workflow has not been qualified. Tool calls, vision and reasoning effort depend on the model; performance depends on the hardware and engines.

The companion is provided under the [MIT license](LICENSE). This license does not cover Bionic, ComfyUI, models or your files.
