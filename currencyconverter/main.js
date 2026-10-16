const CURRENCIES = {
  KRW: "대한민국 원",
  USD: "미국 달러",
  EUR: "유로",
  JPY: "일본 엔",
  CNY: "중국 위안",
  GBP: "영국 파운드",
  AUD: "호주 달러",
  CAD: "캐나다 달러",
  CHF: "스위스 프랑",
  HKD: "홍콩 달러",
  SGD: "싱가포르 달러",
  THB: "태국 바트",
  VND: "베트남 동",
};

// API 실패 시 사용하는 대략적인 USD 기준 환율
const FALLBACK_RATES = {
  USD: 1, KRW: 1400, EUR: 0.92, JPY: 150, CNY: 7.2, GBP: 0.78,
  AUD: 1.5, CAD: 1.36, CHF: 0.88, HKD: 7.8, SGD: 1.34, THB: 35, VND: 25000,
};

const API_URL = "https://open.er-api.com/v6/latest/USD";

const $amount = document.getElementById("amount");
const $from = document.getElementById("from");
const $to = document.getElementById("to");
const $swap = document.getElementById("swap");
const $error = document.getElementById("error");
const $result =document.getElementById("result");
const $rate = document.getElementById("rate");
const $status = document.getElementById("status");

let rates = FALLBACK_RATES;

function fillOptions(select, selected) {
  for (const [code, name] of Object.entries(CURRENCIES)) {
    const opt = new Option(`${code} - ${name}`, code);
    opt.selected = code === selected;
    select.add(opt);
  }
}

function format(value, currency) {
  const digits = Math.min(Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits, 2);
  return new Intl.NumberFormat("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

const MAX_AMOUNT = 1e15;

// 유효하면 빈 문자열, 아니면 경고 메시지를 반환
function validateAmount(amount) {
  if ($amount.validity.badInput) return "숫자만 입력하세요.";
  if ($amount.value.trim() === "") return "금액을 입력하세요.";
  if (!Number.isFinite(amount)) return "올바른 금액을 입력하세요.";
  if (amount <= 0) return "0보다 큰 값을 입력하세요.";
  if (amount > MAX_AMOUNT) return "입력할 수 있는 최대 금액을 초과했습니다.";
  return "";
}

function convert() {
  const from = $from.value;
  const to = $to.value;
  const amount = parseFloat($amount.value);
  const unit = rates[to] / rates[from];

  $rate.textContent = `1 ${from} = ${unit.toLocaleString("ko-KR", { maximumFractionDigits: 4 })} ${to}`;

  const error = validateAmount(amount);
  $error.textContent = error;
  $error.hidden = !error;
  $amount.classList.toggle("invalid", Boolean(error));
  if (error) {
    $result.value = "0";
    return;
  }
  $result.value = `${format(amount * unit, to)} ${to}`;
}

function swap() {
  [$from.value, $to.value] = [$to.value, $from.value];
  $swap.classList.toggle("flipped");
  convert();
}

async function loadRates() {
  try {
    const res = await fetch(API_URL);
    const data = await res.json();
    if (data.result !== "success") throw new Error("bad response");
    rates = data.rates;
    $status.textContent = `최근 업데이트: ${new Date(data.time_last_update_unix * 1000).toLocaleString("ko-KR")}`;
    $status.classList.remove("warn");
  } catch {
    rates = FALLBACK_RATES;
    $status.textContent = "실시간 환율을 불러오지 못해 오프라인 근사치를 사용합니다.";
    $status.classList.add("warn");
  }
  convert();
}

fillOptions($from, "USD");
fillOptions($to, "KRW");
$amount.addEventListener("input", convert);
$from.addEventListener("change", convert);
$to.addEventListener("change", convert);
$swap.addEventListener("click", swap);

convert();
loadRates();
