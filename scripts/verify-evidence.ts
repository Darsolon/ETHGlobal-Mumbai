import 'dotenv/config';
import { Store } from '../src/store.js';
import { verifyHcsOnMirror, verifyPaymentOnMirror } from '../src/verification.js';

// Read-only verification: no automatic evidence-file edits and no payment or HCS writes.
const command=process.argv[2];
if(command==='payment') {
  const [transactionId,payer,merchant,tokenId,amount]=process.argv.slice(3);
  if(!transactionId||!payer||!merchant||!tokenId||!amount) throw new Error('Usage: npm run verify:evidence -- payment TX_ID PAYER MERCHANT TOKEN_ID AMOUNT_ATOMIC');
  console.log(JSON.stringify(await verifyPaymentOnMirror({transactionId,payer,merchant,tokenId,amount}),null,2));
} else if(command==='hcs') {
  const events=new Store().events();
  const anchored=events.filter(e=>e.hcs);
  if(!anchored.length) throw new Error('No HCS anchors in this journal. Local/demo events are not on-chain evidence.');
  for(const event of anchored) console.log(JSON.stringify(await verifyHcsOnMirror(event)));
} else throw new Error('Usage: npm run verify:evidence -- payment ... | hcs');
