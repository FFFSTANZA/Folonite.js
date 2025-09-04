# Folonite.js

**Folonite.js** – the **first lightweight framework** that integrates **dynamic server-side rendering (SSR)**, **streaming capabilities**, and an **external component marketplace**. Built for developers who need a flexible, scalable, and powerful full-stack web framework with built-in **advanced CLI tools**.

**Folonite Labs**, a division under **Folonite**, focuses on providing innovative solutions that enrich the entire developer ecosystem.

## Key Features:

- **Dynamic Server-Side Rendering (SSR)**: Effortlessly generate content server-side for fast load times and enhanced SEO.
- **Streaming Content**: Stream page content directly to the client for faster interactivity and a smoother user experience.
- **Component Marketplace (External)**: Access, download, and contribute to community-driven components hosted on GitHub.
- **Advanced CLI**: Simplify project management with commands to check versions, install dependencies, and clear cache.
- **Automatic Dependency Management**: Ensure your project is always up to date without manual intervention.
- **API Handling with JSON Parsing & Authentication**: Built-in API routes with JSON body parsing and optional middleware for authentication.

---

## Installation

### Install via npm

To install **Folonite.js** using npm, run the following command:

```bash
npm install folonite.js
```

This will install the **Folonite.js** package inside the `node_modules/` directory.

#### Transfer the Package

After installation, transfer the **Folonite.js** package to your working directory:

1. Navigate to the `node_modules/folonite.js` folder:

```bash
cd node_modules/folonite.js
```

2. Copy or move the **Folonite.js** package to your project directory:

```bash
cp -r . ../../your-project-directory/
```

Alternatively, move the package:

```bash
mv ./node_modules/folonite.js ./your-project-directory/
```

3. After transferring, initialize your project:

```bash
npm init
```

---

### Install via GitHub

You can also clone the **Folonite.js** repository directly from GitHub:

1. Clone the **Folonite.js** repository:

```bash
git clone https://github.com/FFFSTANZA/folonite.js.git
```

2. Navigate to the project directory:

```bash
cd folonite.js
```

3. Install dependencies:

```bash
npm install
```

4. Once installed, run the following to start the server:

```bash
npm start
```

---

Both methods will set up **Folonite.js** in your project, and you'll be ready to start building with it!

## Quick Start

Once installed, you can run the following commands to get started.

### Start the Development Server
```bash
npm run dev
```
This will start the development server with **Nodemon**, which automatically restarts the server when changes are detected.

### Start the Production Server
```bash
npm start
```
This will start the production-ready server with compression and optimization enabled.

### Check Version
To check the current version of **Folonite.js** installed:

```bash
npm run folonite version
```

### Install Dependencies
To auto-install all project dependencies:

```bash
npm run folonite -- dependencies
```

### Check for Outdated Dependencies
To check if any dependencies in your project are outdated:

```bash
npm run folonite -- outdated
```

### Clean `node_modules` and Reinstall Dependencies
This command will remove the `node_modules` directory and reinstall all project dependencies from scratch:

```bash
npm run folonite -- clean
```

### Clear npm Cache
To clear your npm cache and ensure smooth installation of packages:

```bash
npm run folonite -- cache
```

---

## Extended Features

Although Folonite.js uses an external component marketplace hosted on GitHub, it provides powerful CLI tools for efficiently managing your projects.

### External Component Marketplace

While Folonite.js doesn't have an internal component marketplace, you can still access community components via the [Folonite-Lib GitHub repository](https://github.com/FFFSTANZA/Folonite-Lib.git). Here, you can:
- Search for components like `navbar`, `footer`, or full templates.
- Download and integrate components directly into your project.

> **Note:** For now, you will need to manually download the components/templates from GitHub and add them to your project. Automated installation of components will be added in future versions.

---

## Built-in CLI Commands

Folonite.js comes with a set of powerful and easy-to-use CLI commands to enhance your development experience.

### 1. Start the Development Server
```bash
npm run dev
```
This command starts the development server and watches for file changes, automatically restarting the server when any changes are detected.

### 2. Start the Production Server
```bash
npm start
```
Start the production server, optimized for deployment with compression and enhanced performance settings.

### 3. Check Folonite.js Version
```bash
npm run folonite -- --version
```
This command prints the current version of **Folonite.js** installed in your project.

### 4. Install Dependencies
```bash
npm run folonite -- dependencies
```
Automatically install all required project dependencies as specified in your `package.json`.

### 5. Check for Outdated Dependencies
```bash
npm run folonite -- outdated
```
This command checks for outdated packages and provides a list of those that need updates.

### 6. Clean and Reinstall Dependencies
```bash
npm run folonite -- clean
```
Remove the `node_modules` folder and reinstall all dependencies from scratch to ensure a clean installation environment.

### 7. Clear npm Cache
```bash
npm run folonite -- cache
```
Clear npm cache to resolve issues related to stale cache files and package installations.

---

### Why Folonite.js?

1. **Developer-Friendly**: Folonite.js focuses on simplicity while offering powerful features for both small and large-scale projects.
2. **Efficient SSR and Streaming**: You get performance benefits out of the box, with the flexibility to scale your applications.
3. **Extendable**: Integrate third-party components and templates easily, and contribute to a growing component marketplace hosted on GitHub.
4. **Built-in CLI for Efficiency**: No need to manually manage dependencies or check versions; Folonite.js does the heavy lifting.

---

## Using the External Component Marketplace

While Folonite.js does not have an internal marketplace, it provides seamless access to an external component marketplace hosted on GitHub. Here’s how you can take advantage of this feature.

### Searching for Components
To search for a component like `navbar` in the external marketplace:
```bash
npm run marketplace -- search navbar
```

### View Information about a Component
To get detailed information about a component, such as the author, version, and description:
```bash
npm run marketplace -- info [componentName]
```

### Download a Component
To download a component/template from the external marketplace:
```bash
npm run marketplace -- download [componentName]
```

For more information, visit the [Folonite-Lib GitHub repository](https://github.com/FFFSTANZA/Folonite-Lib.git).

---

## Contribution

Want to contribute to the **Folonite.js** ecosystem? We welcome contributions to Folonite.js! Whether you're looking to add new features, fix bugs, or enhance the documentation, your input is highly valued. Here’s how you can help:
- Submit components or templates to the [Folonite-Lib GitHub repository](https://github.com/FFFSTANZA/Folonite-Lib.git).
- For any doubts or requests regarding contributions, feel free to reach out to us via our LinkedIn page:

[Contact Folonite Labs on LinkedIn](https://www.linkedin.com/company/folonite)

---

## Documentation

For full documentation and more advanced guides, please visit our [Extended Documentation](https://fffstanza.github.io/Folonite.js-Doc/). Here you will find detailed information on advanced features, integrating third-party components, and more.

---

## License
MIT License © Folonite Labs

---

