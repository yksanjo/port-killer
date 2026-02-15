# Port Killer

Kill processes occupying specific ports with force and safety features.

## Installation

```bash
cd port-killer
npm install
```

## Usage

### Kill a process on a port

```bash
npm start kill 3000
```

### Force kill without confirmation

```bash
npm start kill 3000 -- -f -y
```

### Kill multiple ports

```bash
npm start kill-all 3000 3001 8080
```

### Kill by process name

```bash
npm start by-name node
```

### List dev ports in use

```bash
npm start list
```

### Dry run

```bash
npm start dry-run 3000 8080
```

## Commands

| Command | Description |
|---------|-------------|
| `kill <port>` | Kill process on port |
| `kill-all [ports]` | Kill multiple ports |
| `by-name <name>` | Kill by process name |
| `list` | List dev ports in use |
| `dry-run <ports>` | Show what would be killed |

## Options

- `-f, --force` - Force kill with SIGKILL
- `-y, --yes` - Skip confirmation
