<?php
/**
 * send-quote.php — Quote Request Email Handler for My3DBuild
 * 
 * Hosted on Krystal cPanel. Receives POST from the configurator quote form
 * and sends formatted emails to both the customer and Andrew.
 * 
 * Deploy to: api.my3dbuild.co.uk/send-quote.php (or public_html subdomain)
 */

// --- CORS ---
$allowed_origins = [
    'https://my3dbuild.co.uk',
    'https://www.my3dbuild.co.uk',
    'https://andrewsgparsons-source.github.io',
    'http://localhost:8080'  // dev — remove in production if desired
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowed_origins)) {
    header("Access-Control-Allow-Origin: $origin");
}
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json; charset=utf-8");

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Only accept POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// --- Parse input ---
$input = json_decode(file_get_contents('php://input'), true);
if (!$input) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON']);
    exit;
}

// --- Validate required fields ---
$name = trim($input['name'] ?? '');
$email = trim($input['email'] ?? '');
$refNumber = trim($input['refNumber'] ?? '');
$source = $input['source'] ?? 'quote-request';

if (empty($name) || empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['error' => 'Name and valid email are required']);
    exit;
}

// --- Optional fields ---
$postcode = trim($input['postcode'] ?? '');
$phone = trim($input['phone'] ?? '');
$budget = trim($input['budget'] ?? '');
$siteStatus = trim($input['siteStatus'] ?? '');
$priceEstimate = $input['priceEstimate'] ?? null;
$pageUrl = trim($input['pageUrl'] ?? '');
$deviceType = trim($input['deviceType'] ?? '');
$timestamp = trim($input['timestamp'] ?? date('c'));
$emailOnly = ($source === 'email-copy');

// --- Config ---
$from_email = 'hello@my3dbuild.co.uk';
$from_name = 'My3DBuild';
$andrew_email = 'hello@my3dbuild.co.uk'; // Andrew gets a copy too
$firstName = explode(' ', $name)[0];

// --- Format budget nicely ---
$budget_labels = [
    'under-5k' => 'Under £5,000',
    '5k-10k' => '£5,000 – £10,000',
    '10k-20k' => '£10,000 – £20,000',
    '20k-plus' => '£20,000+'
];
$budget_display = $budget_labels[$budget] ?? $budget;

// --- Format site status ---
$site_labels = [
    'clear' => 'Clear & ready',
    'needs-groundwork' => 'Needs groundwork',
    'not-sure' => 'Not sure'
];
$site_display = $site_labels[$siteStatus] ?? $siteStatus;

// --- Price range ---
$price_display = '';
if ($priceEstimate && isset($priceEstimate['low']) && isset($priceEstimate['high'])) {
    $price_display = '£' . number_format($priceEstimate['low']) . ' – £' . number_format($priceEstimate['high']);
}

// ============================================================
// EMAIL 1: Customer confirmation
// ============================================================
if ($emailOnly) {
    $customer_subject = "Your My3DBuild Design — $refNumber";
} else {
    $customer_subject = "Quote Request Received — $refNumber";
}

$customer_body = "
<html>
<head>
<style>
    body { font-family: 'Inter', Arial, sans-serif; color: #333; line-height: 1.6; margin: 0; padding: 0; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { background: #2D5A7B; color: #ffffff; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
    .body { padding: 30px; }
    .body h2 { color: #2D5A7B; font-size: 20px; margin-top: 0; }
    .details-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .details-table td { padding: 10px 12px; border-bottom: 1px solid #eee; }
    .details-table td:first-child { font-weight: 600; color: #555; width: 40%; }
    .ref-box { background: #f0f7fb; border: 1px solid #2D5A7B; border-radius: 8px; padding: 15px; text-align: center; margin: 20px 0; }
    .ref-box .ref { font-size: 22px; font-weight: 700; color: #2D5A7B; letter-spacing: 1px; }
    .next-steps { background: #fafafa; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .next-steps h3 { margin-top: 0; color: #2D5A7B; }
    .next-steps ol { padding-left: 20px; }
    .next-steps li { margin-bottom: 8px; }
    .footer { background: #f5f5f5; padding: 20px; text-align: center; font-size: 12px; color: #999; }
    .link-btn { display: inline-block; background: #2D5A7B; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
</style>
</head>
<body>
<div class='container'>
    <div class='header'>
        <h1>My3DBuild</h1>
    </div>
    <div class='body'>
        <h2>Hi $firstName,</h2>";

if ($emailOnly) {
    $customer_body .= "<p>Here's a copy of your 3D building design as requested.</p>";
} else {
    $customer_body .= "<p>Thanks for your quote request — I've received your design and I'll personally review it and get back to you within 48 hours.</p>";
}

$customer_body .= "
        <div class='ref-box'>
            <div style='font-size: 12px; color: #888; margin-bottom: 4px;'>Your Reference</div>
            <div class='ref'>$refNumber</div>
        </div>";

// Add design details if we have them
if ($postcode || $budget_display || $site_display || $price_display) {
    $customer_body .= "
        <table class='details-table'>";
    
    if ($price_display) {
        $customer_body .= "<tr><td>Estimated Price Range</td><td>$price_display</td></tr>";
    }
    if ($postcode) {
        $customer_body .= "<tr><td>Postcode</td><td>$postcode</td></tr>";
    }
    if ($budget_display) {
        $customer_body .= "<tr><td>Budget Range</td><td>$budget_display</td></tr>";
    }
    if ($site_display) {
        $customer_body .= "<tr><td>Site Status</td><td>$site_display</td></tr>";
    }
    $customer_body .= "</table>";
}

// Link back to their design
if ($pageUrl) {
    $customer_body .= "
        <p style='text-align: center;'>
            <a href='$pageUrl' class='link-btn'>View Your Design</a>
        </p>";
}

if (!$emailOnly) {
    $customer_body .= "
        <div class='next-steps'>
            <h3>What Happens Next</h3>
            <ol>
                <li>I'll review your design and check the specification</li>
                <li>We'll arrange a quick chat or site visit</li>
                <li>You'll receive a detailed quote with full breakdown</li>
            </ol>
        </div>";
}

$customer_body .= "
        <p>If you have any questions in the meantime, just reply to this email.</p>
        <p>Best regards,<br><strong>Andrew Parsons</strong><br>My3DBuild</p>
    </div>
    <div class='footer'>
        <p>My3DBuild — Design Your Building in 3D</p>
        <p><a href='https://my3dbuild.co.uk'>my3dbuild.co.uk</a></p>
    </div>
</div>
</body>
</html>";

// ============================================================
// EMAIL 2: Notification to Andrew
// ============================================================
$andrew_subject = "🏠 New " . ($emailOnly ? "Email Copy" : "Quote Request") . " — $refNumber ($firstName)";

$andrew_body = "
<html>
<body style='font-family: Arial, sans-serif; color: #333; line-height: 1.6;'>
<h2 style='color: #2D5A7B;'>New " . ($emailOnly ? "Email Copy Request" : "Quote Request") . "</h2>
<table style='border-collapse: collapse; width: 100%;'>
    <tr><td style='padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;'>Reference</td><td style='padding: 8px; border-bottom: 1px solid #eee;'>$refNumber</td></tr>
    <tr><td style='padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;'>Name</td><td style='padding: 8px; border-bottom: 1px solid #eee;'>$name</td></tr>
    <tr><td style='padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;'>Email</td><td style='padding: 8px; border-bottom: 1px solid #eee;'><a href='mailto:$email'>$email</a></td></tr>";

if ($phone) {
    $andrew_body .= "<tr><td style='padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;'>Phone</td><td style='padding: 8px; border-bottom: 1px solid #eee;'><a href='tel:$phone'>$phone</a></td></tr>";
}
if ($postcode) {
    $andrew_body .= "<tr><td style='padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;'>Postcode</td><td style='padding: 8px; border-bottom: 1px solid #eee;'>$postcode</td></tr>";
}
if ($budget_display) {
    $andrew_body .= "<tr><td style='padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;'>Budget</td><td style='padding: 8px; border-bottom: 1px solid #eee;'>$budget_display</td></tr>";
}
if ($site_display) {
    $andrew_body .= "<tr><td style='padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;'>Site Status</td><td style='padding: 8px; border-bottom: 1px solid #eee;'>$site_display</td></tr>";
}
if ($price_display) {
    $andrew_body .= "<tr><td style='padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;'>Price Estimate</td><td style='padding: 8px; border-bottom: 1px solid #eee;'>$price_display</td></tr>";
}
$andrew_body .= "
    <tr><td style='padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;'>Device</td><td style='padding: 8px; border-bottom: 1px solid #eee;'>$deviceType</td></tr>
    <tr><td style='padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;'>Submitted</td><td style='padding: 8px; border-bottom: 1px solid #eee;'>$timestamp</td></tr>
</table>";

if ($pageUrl) {
    $andrew_body .= "<p><a href='$pageUrl' style='display: inline-block; background: #2D5A7B; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 4px;'>View Their Design</a></p>";
}

$andrew_body .= "
<p style='color: #999; font-size: 12px;'>This lead is also saved in Firebase.</p>
</body>
</html>";

// ============================================================
// SEND EMAILS
// ============================================================
$headers = "MIME-Version: 1.0\r\n";
$headers .= "Content-type: text/html; charset=UTF-8\r\n";
$headers .= "From: $from_name <$from_email>\r\n";
$headers .= "Reply-To: $from_email\r\n";

$customer_sent = mail($email, $customer_subject, $customer_body, $headers);
$andrew_sent = mail($andrew_email, $andrew_subject, $andrew_body, $headers);

// --- Response ---
if ($customer_sent && $andrew_sent) {
    echo json_encode(['success' => true, 'message' => 'Emails sent']);
} elseif ($customer_sent || $andrew_sent) {
    echo json_encode(['success' => true, 'message' => 'Partial — one email sent', 'customer' => $customer_sent, 'andrew' => $andrew_sent]);
} else {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to send emails']);
}
