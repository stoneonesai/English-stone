<?php
declare(strict_types=1);

if (!function_exists("array_is_list")) {
  function array_is_list(array $array): bool {
    if ($array === []) return true;
    $expected = 0;
    foreach ($array as $key => $unused) {
      if ($key !== $expected) return false;
      $expected++;
    }
    return true;
  }
}

header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: no-store");

function respond(int $status, array $body): void {
  http_response_code($status);
  echo json_encode($body, JSON_UNESCAPED_UNICODE);
  exit;
}

function textLength(string $value): int {
  if (function_exists("mb_strlen")) return mb_strlen($value, "UTF-8");
  return strlen($value);
}

function validState(mixed $data): bool {
  if (!is_array($data) || array_is_list($data)) return false;
  if (!isset($data["words"]) || !is_array($data["words"]) || !array_is_list($data["words"]) || count($data["words"]) > 8000) return false;
  if (!isset($data["goal"]) || !is_int($data["goal"]) || $data["goal"] < 1 || $data["goal"] > 100) return false;
  if (!isset($data["today"]) || !is_array($data["today"]) || !isset($data["today"]["date"]) || !is_string($data["today"]["date"]) || !isset($data["today"]["ids"]) || !is_array($data["today"]["ids"])) return false;
  $statuses = ["hard" => true, "easy" => true, "known" => true, "unsure" => true, "new" => true];
  $ids = [];
  foreach ($data["words"] as $word) {
    if (!is_array($word) || array_is_list($word)) return false;
    if (!isset($word["id"], $word["en"], $word["de"], $word["status"])) return false;
    if (!is_string($word["id"]) || $word["id"] === "" || textLength($word["id"]) > 80) return false;
    if (isset($ids[$word["id"]])) return false;
    $ids[$word["id"]] = true;
    if (!is_string($word["en"]) || trim($word["en"]) === "" || textLength($word["en"]) > 400) return false;
    if (!is_string($word["de"]) || trim($word["de"]) === "" || textLength($word["de"]) > 800) return false;
    foreach (["exampleEn" => 2000, "exampleDe" => 2000, "note" => 2000] as $field => $max) {
      if (array_key_exists($field, $word) && $word[$field] !== null) {
        if (!is_string($word[$field]) || textLength($word[$field]) > $max) return false;
      }
    }
    if (array_key_exists("topic", $word) && $word["topic"] !== null && !is_string($word["topic"])) return false;
    if (!is_string($word["status"]) || !isset($statuses[$word["status"]])) return false;
  }
  return true;
}

function decodeAccess(?string $header): string {
  if ($header === null || $header === "") return "";
  $decoded = base64_decode($header, true);
  if ($decoded === false) return "";
  return $decoded;
}

$configFile = __DIR__ . "/config.php";
if (!is_file($configFile)) respond(503, ["error" => "not-configured"]);
$config = require $configFile;
$password = is_array($config) ? (string)($config["password"] ?? "") : "";
if ($password === "") respond(503, ["error" => "not-configured"]);
$given = decodeAccess(isset($_SERVER["HTTP_X_ACCESS_WORD"]) ? (string)$_SERVER["HTTP_X_ACCESS_WORD"] : "");
if (!hash_equals($password, $given)) respond(401, ["error" => "unauthorized"]);

$dir = __DIR__ . "/storage";
$file = $dir . "/state.json";
if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) respond(500, ["error" => "store"]);

$method = $_SERVER["REQUEST_METHOD"] ?? "GET";

if ($method === "GET") {
  if (!is_file($file)) respond(200, ["state" => null]);
  $raw = file_get_contents($file);
  $stored = is_string($raw) ? json_decode($raw, true) : null;
  if (!is_array($stored)) respond(500, ["error" => "store"]);
  if (isset($stored["words"])) {
    respond(200, ["version" => 1, "vocabIds" => null, "state" => $stored]);
  }
  respond(200, [
    "version" => 1,
    "vocabIds" => $stored["vocabIds"] ?? null,
    "state" => $stored["state"] ?? null,
  ]);
}

if ($method === "PUT") {
  $raw = file_get_contents("php://input");
  if (!is_string($raw)) respond(400, ["error" => "invalid-json"]);
  if (strlen($raw) > 3000000) respond(413, ["error" => "too-large"]);
  $body = json_decode($raw, true);
  if (!is_array($body)) respond(400, ["error" => "invalid-json"]);
  $state = isset($body["state"]) && is_array($body["state"]) ? $body["state"] : $body;
  if (isset($state["history"]) && is_array($state["history"]) && count($state["history"]) > 120) {
    $state["history"] = array_values(array_slice($state["history"], -120));
  }
  if (!validState($state)) respond(400, ["error" => "invalid-state"]);
  $vocabIds = [];
  if (isset($body["vocabIds"]) && is_array($body["vocabIds"])) {
    foreach ($body["vocabIds"] as $id) {
      if (is_string($id) && $id !== "" && textLength($id) <= 80) $vocabIds[] = $id;
      if (count($vocabIds) >= 8000) break;
    }
  }
  $state["updatedAt"] = gmdate("c");
  $json = json_encode(
    ["version" => 1, "vocabIds" => $vocabIds, "state" => $state],
    JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
  );
  if ($json === false) respond(500, ["error" => "store"]);
  $tmp = $dir . "/state-" . bin2hex(random_bytes(8)) . ".tmp";
  if (file_put_contents($tmp, $json, LOCK_EX) === false) respond(500, ["error" => "store"]);
  $backup = $file . ".bak";
  if (is_file($backup) && !unlink($backup)) {
    unlink($tmp);
    respond(500, ["error" => "store"]);
  }
  if (is_file($file) && !rename($file, $backup)) {
    unlink($tmp);
    respond(500, ["error" => "store"]);
  }
  if (!rename($tmp, $file)) {
    if (is_file($backup)) rename($backup, $file);
    if (is_file($tmp)) unlink($tmp);
    respond(500, ["error" => "store"]);
  }
  if (is_file($backup)) unlink($backup);
  respond(200, ["ok" => true, "updatedAt" => $state["updatedAt"]]);
}

respond(405, ["error" => "method"]);
