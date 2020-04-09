/* global require, process */
async function main(require, process) {
  const m0name = process.argv[2];
  if (!m0name) {
    console.log('Usage: node run.cjs main.js arg2 arg3 ...');
    process.exit(1);
  }

  process.argv.shift();
  // console.log(`${m0name}.run(resolve, process) with args: ${process.argv.join(' ')}`);
  const { run } = await import(m0name);
  run(require, process);
}

main(require, process).catch((err) => console.log(err.message));
