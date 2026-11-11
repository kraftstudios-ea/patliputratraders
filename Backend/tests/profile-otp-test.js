// ============================================================================
// BRUSH — Profile OTP Verification & Update Integration Test
// ============================================================================

const assert = require('assert');

(async () => {
  console.log('\n============================================================');
  console.log('TESTING PROFILE OTP SEND & VERIFY WORKFLOW (END-TO-END)');
  console.log('============================================================\n');

  const BASE_URL = 'http://localhost:5500/api';

  // Step 1: Create a temporary test account
  const testEmail = `kumarmangalam.patna+test${Date.now()}@gmail.com`;
  const testPassword = 'Password123!';

  console.log('1. Creating test user:', testEmail);
  const signupRes = await fetch(`${BASE_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: testEmail,
      email: testEmail,
      password: testPassword,
      name: 'OTP Test User',
      phone: '9123456789'
    })
  });

  const signupData = await signupRes.json();
  assert(signupRes.ok, `Signup failed: ${signupData.error}`);
  console.log('   Signup successful. User ID:', signupData.userId);

  const token = signupData.token;
  assert(token, 'No session token received on signup');
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'x-brush-test': 'true'
  };

  // Step 2: Request OTP for new email
  const newEmail = `kumarmangalam.patna+otp${Date.now()}@gmail.com`;
  console.log('\n2. Requesting OTP for new email:', newEmail);
  const sendEmailOtpRes = await fetch(`${BASE_URL}/auth/profile/send-otp`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      field: 'email',
      value: newEmail
    })
  });

  const sendEmailOtpData = await sendEmailOtpRes.json();
  console.log('   Send OTP Response status:', sendEmailOtpRes.status, sendEmailOtpData);
  assert(sendEmailOtpRes.ok, `Send email OTP failed: ${sendEmailOtpData.error}`);
  assert.strictEqual(sendEmailOtpData.success, true, 'Expected success: true');
  assert(sendEmailOtpData.maskedEmail, 'Expected maskedEmail in response');
  const emailOtp = sendEmailOtpData.devOtp;
  assert(emailOtp, 'Expected OTP in test mode');

  // Step 3: Test verifying with WRONG OTP
  console.log('\n3. Testing verification with invalid OTP (000000)...');
  const badVerifyRes = await fetch(`${BASE_URL}/auth/profile/verify-otp`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      field: 'email',
      otp: '000000'
    })
  });
  const badVerifyData = await badVerifyRes.json();
  console.log('   Bad verify status:', badVerifyRes.status, badVerifyData.error);
  assert.strictEqual(badVerifyRes.status, 400, 'Expected status 400 for bad OTP');
  assert(badVerifyData.error.includes('Incorrect verification code'), 'Expected incorrect code message');

  // Step 4: Verify with CORRECT OTP
  console.log('\n4. Testing verification with correct OTP:', emailOtp);
  const goodVerifyRes = await fetch(`${BASE_URL}/auth/profile/verify-otp`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      field: 'email',
      otp: emailOtp
    })
  });
  const goodVerifyData = await goodVerifyRes.json();
  console.log('   Good verify status:', goodVerifyRes.status, goodVerifyData);
  assert(goodVerifyRes.ok, `Correct OTP verification failed: ${goodVerifyData.error}`);
  assert.strictEqual(goodVerifyData.profile.email, newEmail, `Profile email was not updated: ${goodVerifyData.profile.email}`);

  // Step 5: Check profile persistence via GET /api/auth/profile/:id
  console.log('\n5. Checking profile persistence via GET /api/auth/profile/:id');
  const getProfileRes = await fetch(`${BASE_URL}/auth/profile/${encodeURIComponent(signupData.userId)}`, {
    headers: authHeaders
  });
  const profileData = await getProfileRes.json();
  console.log('   Persistent Profile email:', profileData.email);
  assert.strictEqual(profileData.email, newEmail, 'Persistent email does not match verified email');

  // Step 6: Request OTP for new phone
  const newPhone = '9988776655';
  console.log('\n6. Requesting OTP for new phone:', newPhone);
  const sendPhoneOtpRes = await fetch(`${BASE_URL}/auth/profile/send-otp`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      field: 'phone',
      value: newPhone
    })
  });

  const sendPhoneOtpData = await sendPhoneOtpRes.json();
  console.log('   Send Phone OTP Response status:', sendPhoneOtpRes.status, sendPhoneOtpData);
  assert(sendPhoneOtpRes.ok, `Send phone OTP failed: ${sendPhoneOtpData.error}`);
  assert.strictEqual(sendPhoneOtpData.success, true, 'Expected success: true');
  const phoneOtp = sendPhoneOtpData.devOtp;
  assert(phoneOtp, 'Expected phone OTP in test mode');

  // Step 7: Verify phone with correct OTP
  console.log('\n7. Verifying phone update with OTP:', phoneOtp);
  const verifyPhoneRes = await fetch(`${BASE_URL}/auth/profile/verify-otp`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      field: 'phone',
      otp: phoneOtp
    })
  });
  const verifyPhoneData = await verifyPhoneRes.json();
  console.log('   Verify phone status:', verifyPhoneRes.status, verifyPhoneData);
  assert(verifyPhoneRes.ok, `Phone verify failed: ${verifyPhoneData.error}`);
  assert.strictEqual(verifyPhoneData.profile.phone, newPhone, 'Profile phone was not updated');

  // Step 8: Verify persistent phone in MongoDB
  const getFinalProfileRes = await fetch(`${BASE_URL}/auth/profile/${encodeURIComponent(signupData.userId)}`, {
    headers: authHeaders
  });
  const finalProfile = await getFinalProfileRes.json();
  console.log('   Final persistent phone:', finalProfile.phone);
  assert.strictEqual(finalProfile.phone, newPhone, 'Persistent phone does not match verified phone');

  console.log('\n============================================================');
  console.log('ALL 8 PROFILE OTP WORKFLOW STEPS PASSED PERFECTLY!');
  console.log('============================================================\n');
})().catch(err => {
  console.error('\nFAILED TEST:', err.message);
  process.exit(1);
});
