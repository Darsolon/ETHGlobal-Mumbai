# Demo walkthrough

The finished narrated walkthrough is [gridagent-demo.mp4](gridagent-demo.mp4): 2:21, 1280×720, H.264 video with AAC narration and no music. It shows actual screenshots of the [public browser simulation](https://gridagent-mumbai-demo.vercel.app). The narration uses a synthetic system voice; the script is [demo-narration.txt](demo-narration.txt). Uploaded and saved to ETHGlobal as media 36939.

The walkthrough covers the planning result, load constraints, useful-data selection, spending controls and hash-linked audit trail. It explicitly distinguishes simulated purchases from actual settlement. No testnet transaction or HCS anchor is claimed.

For a live demo, open the public URL and select **Plan next shift**. The default run buys two simulated feeds for 0.018 USDC and yields EUR122.14 modeled savings. Edit loads or limits and rerun; a small budget declines purchases and uses labeled flat priors. Browser-local records can be reset by the browser owner and provide no independent security guarantee.

For the HTTP 402 exchange, run the Express application with `npm start`. For actual Hedera evidence, fund a project testnet account, configure the documented merchant/facilitator/HCS settings, perform the real transfer and independently verify it with the Mirror Node CLI. Never present a signed but unsubmitted transaction as settlement.

ETHGlobal finalist video requirements observed in the authenticated form: 2–4 minutes, minimum 720p, audio without music. The product walkthrough satisfies the media format; verified Hedera settlement is still a separate missing proof.
