const { sendDiwaliEmail, getAllBccRecipients } = require('./send-diwali-email');

async function runDirectBroadcast() {
  const recipients = await getAllBccRecipients();
  console.log(`Starting direct individual broadcast to ${recipients.length} recipients...`);
  
  const results = [];
  for (let i = 0; i < recipients.length; i++) {
    const email = recipients[i];
    console.log(`[${i + 1}/${recipients.length}] Sending to ${email}...`);
    try {
      const res = await sendDiwaliEmail({
        to: email,
        name: 'Friend',
        isDemo: false
      });
      console.log(`  ✓ Delivered: ${res.messageId}`);
      results.push({ email, success: true, messageId: res.messageId });
    } catch (err) {
      console.error(`  ✗ Error sending to ${email}:`, err.message);
      results.push({ email, success: false, error: err.message });
    }
    // Polite throttle of 800ms between sends to stay well under Resend rate limits
    await new Promise(r => setTimeout(r, 800));
  }
  
  const succeeded = results.filter(r => r.success).length;
  console.log(`\n========================================`);
  console.log(`Broadcast Complete: ${succeeded}/${recipients.length} delivered successfully.`);
  console.log(`========================================\n`);
  return results;
}

if (require.main === module) {
  runDirectBroadcast()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Fatal error in broadcast:', err);
      process.exit(1);
    });
}
