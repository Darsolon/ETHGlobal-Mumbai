import 'dotenv/config';
import { createTopic } from '../src/hedera.js';
console.log('HEDERA_TOPIC_ID='+await createTopic());
