process.stdout.write(JSON.stringify({
  argv: process.argv.slice(2),
  dshHome: process.env.DSH_HOME,
  electronRunAsNode: process.env.ELECTRON_RUN_AS_NODE,
  hasNodeOptions: Object.hasOwn(process.env, 'NODE_OPTIONS'),
}));
