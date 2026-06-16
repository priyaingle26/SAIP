# SAIP AI Scribe — Extension

An enterprise-grade, high-performance Extension that acts as an EHR overlay, providing clinicians with real-time ambient clinical scribing, automated clinical note generation, and smart autofilling into Electronic Health Record (EHR) forms.

Built with **WXT**, **React**, and **TypeScript**.

---

## Features

- **Ambient Clinical Recording:** Captures high-fidelity session audio using secure background offscreen recording APIs.
- **Real-Time Transcription & Processing:** Transcribes conversations and processes them into structured clinical notes.
- **Intelligent Field Mapping:** Automatically parses, formats, and maps note sections (Chief Complaint, SOAP, MSE, etc.) to target input elements on supported EHR platforms.
- **One-Click Autofill:** Seamlessly injects generated clinical data directly into corresponding form fields without submitting, allowing final review and confirmation by the clinician.
- **Encounters History:** Local repository of recent patient encounters, recording timestamps, live transcripts, and generated progress notes.
- **Secure Authentication:** Integrates with backend JWT authentication services.

---

## Tech Stack

- **Framework:** [WXT (Next-gen Web Extension Framework)](https://wxt.dev/)
- **Bundler:** Vite
- **UI Framework:** React
- **Language:** TypeScript
- **Styling:** Vanilla CSS with premium dark-mode aesthetics, custom SVG micro-animations, and glassmorphism.

---

## Directory Structure

```
saip-extension/
├── assets/             # Extension static logo icons
├── components/         # Reusable React UI components (Autofill, History, Views)
├── entrypoints/        # WXT Entrypoints
│   ├── background.ts   # Service worker handling background tasks
│   ├── content.ts      # Content script running inside EHR pages for field mapping
│   ├── offscreen/      # Secure offscreen document for media-recorder access
│   └── sidepanel/      # Premium side-panel React UI dashboard
├── lib/                # Shared utilities, schemas, constants, and API clients
├── public/             # Static public assets
├── tsconfig.json       # TypeScript configuration
└── wxt.config.ts       # WXT compilation and packaging config
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [npm](https://www.npmjs.com/) or another package manager

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables (if any) or ensure the backend service is running locally at `http://localhost:8000`.

### Development

Run the extension in development mode with hot-reloading:
```bash
npm run dev
```
WXT will automatically launch a clean instance of Google Chrome with the extension pre-loaded and ready for testing.

### Production Build

Build the production bundle:
```bash
npm run build
```
The compiled files will be output to `.output/chrome-mv3/`. You can load this directory unpacked directly into Chrome via `chrome://extensions/` by enabling **Developer mode**.

---

## License

Proprietary and Confidential. All rights reserved.
