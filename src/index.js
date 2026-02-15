#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const { exec } = require('child_process');
const util = require('util');
const readline = require('readline');

const execPromise = util.promisify(exec);

const program = new Command();

program
  .name('port-killer')
  .description('Kill processes occupying specific ports with force and safety features')
  .version('1.0.0');

/**
 * Get PID using a port
 */
async function getPortPid(port) {
  try {
    const { stdout } = await execPromise(`lsof -i :${port} -t`);
    const pid = stdout.trim();
    return pid ? parseInt(pid) : null;
  } catch {
    return null;
  }
}

/**
 * Get process info
 */
async function getProcessInfo(pid) {
  try {
    const { stdout } = await execPromise(`ps -p ${pid} -o args=`);
    return {
      pid,
      command: stdout.trim(),
      raw: stdout.trim()
    };
  } catch {
    return { pid, command: 'Unknown', raw: '' };
  }
}

/**
 * Get all processes on ports
 */
async function getPortsWithProcesses() {
  try {
    const { stdout } = await execPromise('lsof -i -P -n | grep LISTEN');
    const lines = stdout.trim().split('\n').filter(l => l);
    
    return lines.map(line => {
      const parts = line.trim().split(/\s+/);
      const pid = parseInt(parts[1]);
      const match = line.match(/:(\d+)\s*\(LISTEN\)/);
      const port = match ? parseInt(match[1]) : 0;
      
      return { pid, port, command: parts[0], line };
    }).filter(p => p.port > 0);
  } catch {
    return [];
  }
}

/**
 * Ask for confirmation
 */
async function askConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Kill a process
 */
async function killProcess(pid, force = false) {
  try {
    if (force) {
      await execPromise(`kill -9 ${pid}`);
    } else {
      try {
        await execPromise(`kill -TERM ${pid}`);
      } catch {
        // If SIGTERM fails, try SIGKILL
        await execPromise(`kill -9 ${pid}`);
      }
    }
    return true;
  } catch (error) {
    return false;
  }
}

program
  .command('kill')
  .description('Kill process on a specific port')
  .argument('<port>', 'Port number')
  .option('-f, --force', 'Force kill with SIGKILL')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (port, options) => {
    const portNum = parseInt(port);
    const pid = await getPortPid(portNum);
    
    if (!pid) {
      console.log(chalk.yellow(`\n⚠️  No process found on port ${portNum}\n`));
      return;
    }
    
    const info = await getProcessInfo(pid);
    
    console.log(chalk.blue.bold('\n🔪 Port Killer'));
    console.log(chalk.gray('═'.repeat(50)));
    console.log(`   Port: ${chalk.cyan(portNum)}`);
    console.log(`   PID: ${chalk.yellow(info.pid)}`);
    console.log(`   Command: ${chalk.green(info.command)}`);
    console.log(chalk.gray('═'.repeat(50)));
    
    // Ask for confirmation
    if (!options.yes) {
      const confirmed = await askConfirmation(
        `\n${chalk.red('⚠️  Kill this process?')} (y/N): `
      );
      
      if (!confirmed) {
        console.log(chalk.gray('\n👋 Cancelled.\n'));
        return;
      }
    }
    
    const success = await killProcess(pid, options.force);
    
    if (success) {
      // Verify it's dead
      await new Promise(r => setTimeout(r, 500));
      const stillRunning = await getPortPid(portNum);
      
      if (stillRunning) {
        console.log(chalk.red('\n❌ Failed to kill process\n'));
      } else {
        console.log(chalk.green('\n✅ Process killed successfully\n'));
      }
    } else {
      console.log(chalk.red('\n❌ Error killing process\n'));
    }
  });

program
  .command('kill-all')
  .description('Kill all processes on multiple ports')
  .argument('[ports...]', 'Port numbers (or empty to list all)')
  .option('-f, --force', 'Force kill')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (ports, options) => {
    let allPorts = ports.map(p => parseInt(p));
    
    // If no ports specified, show interactive selector
    if (allPorts.length === 0) {
      const portProcesses = await getPortsWithProcesses();
      
      if (portProcesses.length === 0) {
        console.log(chalk.yellow('\n⚠️  No ports in use\n'));
        return;
      }
      
      console.log(chalk.blue.bold('\n📋 Ports in use:\n'));
      
      // Show dev ports only
      const devPorts = portProcesses.filter(p => 
        [3000, 3001, 3002, 3003, 3004, 3005, 4000, 4001, 4200, 5000, 5001,
         5173, 5174, 5175, 5176, 5177, 5178, 5179, 5180, 5500, 6000, 7000,
         8000, 8080, 8081, 8888, 9000, 27017].includes(p.port)
      );
      
      for (const p of devPorts) {
        console.log(`   ${chalk.cyan(String(p.port).padEnd(6))}  PID: ${String(p.pid).padEnd(6)}  ${p.command}`);
      }
      
      console.log(chalk.gray('\n   Usage: port-killer kill-all 3000 3001 8080\n'));
      return;
    }
    
    console.log(chalk.blue.bold('\n🔪 Killing processes on ports: ') + chalk.cyan(allPorts.join(', ')));
    
    // Get process info for each port
    for (const port of allPorts) {
      const pid = await getPortPid(port);
      if (pid) {
        const info = await getProcessInfo(pid);
        console.log(chalk.gray(`\n   Port ${port}: ${info.command} (PID: ${pid})`));
        
        if (!options.yes) {
          const confirmed = await askConfirmation(
            `   ${chalk.red('Kill?')} (y/N): `
          );
          if (!confirmed) {
            console.log(chalk.gray('   Skipped.'));
            continue;
          }
        }
        
        const success = await killProcess(pid, options.force);
        console.log(success ? chalk.green('   ✅ Killed') : chalk.red('   ❌ Failed'));
      } else {
        console.log(chalk.yellow(`\n   Port ${port}: No process found`));
      }
    }
    
    console.log();
  });

program
  .command('by-name')
  .description('Kill processes by name')
  .argument('<name>', 'Process name (e.g., node, python)')
  .option('-f, --force', 'Force kill')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (name, options) => {
    console.log(chalk.blue.bold(`\n🔪 Killing processes matching: ${name}\n`));
    
    try {
      // Find processes by name
      const { stdout } = await execPromise(`pgrep -f ${name}`);
      const pids = stdout.trim().split('\n').filter(p => p);
      
      if (pids.length === 0) {
        console.log(chalk.yellow(`⚠️  No processes found matching "${name}"\n`));
        return;
      }
      
      console.log(chalk.gray(`Found ${pids.length} process(es):\n`));
      
      for (const pid of pids) {
        const pidNum = parseInt(pid);
        const info = await getProcessInfo(pidNum);
        console.log(`   PID: ${chalk.yellow(pidNum)}  Command: ${chalk.green(info.command)}`);
      }
      
      if (!options.yes) {
        const confirmed = await askConfirmation(
          `\n${chalk.red('⚠️  Kill all these processes?')} (y/N): `
        );
        
        if (!confirmed) {
          console.log(chalk.gray('\n👋 Cancelled.\n'));
          return;
        }
      }
      
      let killed = 0;
      for (const pid of pids) {
        const pidNum = parseInt(pid);
        const success = await killProcess(pidNum, options.force);
        if (success) killed++;
      }
      
      console.log(chalk.green(`\n✅ Killed ${killed}/${pids.length} processes\n`));
      
    } catch (error) {
      console.log(chalk.red(`Error: ${error.message}\n`));
    }
  });

program
  .command('list')
  .description('List all processes on common dev ports')
  .action(async () => {
    const portProcesses = await getPortsWithProcesses();
    
    // Filter to dev ports
    const devPorts = [3000, 3001, 3002, 3003, 3004, 3005, 4000, 4001, 4200, 5000, 5001,
      5173, 5174, 5175, 5176, 5177, 5178, 5179, 5180, 5500, 6000, 7000,
      8000, 8080, 8081, 8888, 9000, 27017];
    
    const filtered = portProcesses.filter(p => devPorts.includes(p.port));
    
    if (filtered.length === 0) {
      console.log(chalk.yellow('\n⚠️  No dev ports in use\n'));
      return;
    }
    
    console.log(chalk.blue.bold('\n📋 Development Ports in Use'));
    console.log(chalk.gray('═'.repeat(60)));
    console.log(' Port     PID       Command');
    console.log(chalk.gray('─'.repeat(60)));
    
    for (const p of filtered) {
      console.log(` ${chalk.cyan(String(p.port).padEnd(8))} ${chalk.yellow(String(p.pid).padEnd(9))} ${p.command}`);
    }
    
    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.green(`   Total: ${filtered.length} port(s)\n`));
    
    console.log(chalk.gray('   Quick kill commands:'));
    for (const p of filtered) {
      console.log(chalk.gray(`   port-killer kill ${p.port}`));
    }
    console.log();
  });

program
  .command('dry-run')
  .description('Show what would be killed without actually killing')
  .argument('[ports...]', 'Port numbers')
  .action(async (ports) => {
    if (ports.length === 0) {
      console.log(chalk.yellow('\n⚠️  Please specify ports or use: port-killer list\n'));
      return;
    }
    
    console.log(chalk.blue.bold('\n🔍 Dry Run - Processes that would be killed:\n'));
    console.log(chalk.gray('─'.repeat(60)));
    
    for (const port of ports) {
      const pid = await getPortPid(parseInt(port));
      if (pid) {
        const info = await getProcessInfo(pid);
        console.log(` ${chalk.cyan(port.padEnd(8))} ${chalk.yellow(String(pid).padEnd(8))} ${info.command}`);
      } else {
        console.log(` ${chalk.cyan(port.padEnd(8))} ${chalk.red('No process')}`);
      }
    }
    
    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.yellow('\n   This was a dry run. Use --help to see kill commands.\n'));
  });

program.parse();
