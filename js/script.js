"use strict";

/* ========================================
   1. Data and Configuration
======================================== */

const CITIES = [
  "Cairo",
  "Alexandria",
  "Banha",
  "Tanta",
  "Mansoura",
  "Zagazig",
  "Assiut",
  "Luxor",
  "Aswan",
  "Sharm El-Sheikh",
  "Hurghada",
  "Port Said"
];

const TIMES = [
  "06:00",
  "09:30",
  "13:00",
  "17:30",
  "22:00"
];

const TOTAL_SEATS = 40;
const STORAGE_KEY = "bus_bookings";

const PROMOS = {
  WELCOME10: 10,
  STUDENT15: 15
};

const PAY = {
  cash: "Pay at boarding",
  vodafone: "Vodafone Cash",
  card: "Bank card"
};

// Bus categories: "mult" multiplies the base fare of the route.
const CATEGORIES = {
  standard: {
    label: "Standard",
    mult: 1,
    perks: "Air-conditioned"
  },
  deluxe: {
    label: "Deluxe",
    mult: 1.25,
    perks: "Extra legroom + Wi-Fi"
  },
  vip: {
    label: "VIP",
    mult: 1.5,
    perks: "Leather seats, charger + drink"
  }
};

// Which category runs at each departure time (same order as TIMES).
const CATEGORY_BY_SLOT = [
  "standard",
  "deluxe",
  "vip",
  "standard",
  "deluxe"
];

// Sample station names. Replace them with your real stations.
const STATIONS = {
  Cairo: ["Ramses", "Almaza", "Giza", "6th of October", "Nasr City"],
  Alexandria: ["Sidi Gaber", "Moharam Bek", "Smouha"],
  Hurghada: ["Main Station", "El Dahar", "Sakkala"],
  "Sharm El-Sheikh": ["Main Station", "Naama Bay"]
};

const state = {
  from: "",
  to: "",
  date: "",
  trips: [],
  trip: null,
  selected: [],
  promo: null
};


/* ========================================
   2. Helper Functions
======================================== */

const $ = (id) => document.getElementById(id);

const egp = (amount) => `EGP ${amount}`;

function hash(str) {
  let h = 0;

  for (const char of str) {
    h = (h * 31 + char.charCodeAt(0)) >>> 0;
  }

  return h;
}

function loadBookings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveBookings(bookings) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(bookings)
    );
  } catch {
    // Storage may be unavailable.
  }
}

function formatDate(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(
    "en-GB",
    {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    }
  );
}

// Returns YYYY-MM-DD using the device's local time (not UTC).
function toLocalISO(date) {
  const offset = date.getTimezoneOffset() * 60000;

  return new Date(date.getTime() - offset)
    .toISOString()
    .slice(0, 10);
}

function showView(id) {
  document.querySelectorAll(".view").forEach((view) => {
    view.hidden = view.id !== id;
  });

  window.scrollTo({
    top: 0
  });

  if (id === "viewBookings") {
    renderBookings();
  }

  if (id === "viewTimetable") {
    renderTimetable();
  }
}

function escapeHTML(value) {
  const element = document.createElement("div");

  element.textContent = value;

  return element.innerHTML;
}

function basePrice(from, to) {
  const route = [from, to].sort().join("-");

  return 80 + (hash(route) % 25) * 10;
}

function routeHours(from, to) {
  const route = [from, to].sort().join("-");

  return 1 + (hash(route) % 7);
}

function stationsOf(city) {
  return STATIONS[city] || ["Main Station", "Ring Road"];
}

// Works for new bookings (category) and old ones (vip flag).
function catLabel(item) {
  if (CATEGORIES[item.category]) {
    return CATEGORIES[item.category].label;
  }

  return item.vip ? "VIP" : "Standard";
}


/* ========================================
   3. Trip Generation
======================================== */

function generateTrips(from, to, date) {
  const base = basePrice(from, to);
  const hours = routeHours(from, to);

  return TIMES.map((time, index) => {
    const category = CATEGORY_BY_SLOT[index];

    const id = `${from}|${to}|${date}|${time}`;

    const trip = {
      id,
      from,
      to,
      date,
      time,
      category,
      price: Math.round(base * CATEGORIES[category].mult),
      duration: hours,
      bus: `A${100 + (hash(id) % 900)}`
    };

    trip.taken = takenSeats(trip);

    return trip;
  });
}

function takenSeats(trip) {
  const taken = new Set();

  for (let seat = 1; seat <= TOTAL_SEATS; seat++) {
    if (hash(`${trip.id}#${seat}`) % 100 < 30) {
      taken.add(seat);
    }
  }

  loadBookings()
    .filter(
      (booking) =>
        booking.tripId === trip.id &&
        booking.status === "active"
    )
    .forEach((booking) => {
      booking.seats.forEach((seat) => {
        taken.add(seat);
      });
    });

  return taken;
}

function arrivalTime(time, hours) {
  const [hour, minute] = time.split(":").map(Number);

  const arrivalHour = (hour + hours) % 24;

  return (
    String(arrivalHour).padStart(2, "0") +
    ":" +
    String(minute).padStart(2, "0")
  );
}

function boardingTime(time) {
  const [hour, minute] = time.split(":").map(Number);

  const totalMinutes = (hour * 60 + minute - 30 + 1440) % 1440;

  const boardingHour = Math.floor(totalMinutes / 60);
  const boardingMinute = totalMinutes % 60;

  return (
    String(boardingHour).padStart(2, "0") +
    ":" +
    String(boardingMinute).padStart(2, "0")
  );
}


/* ========================================
   4. Search Form
======================================== */

function fillCities() {
  const options = CITIES.map(
    (city) => `<option>${city}</option>`
  ).join("");

  $("from").innerHTML = options;
  $("to").innerHTML = options;
  $("ttFrom").innerHTML = options;

  $("from").value = "Cairo";
  $("to").value = "Alexandria";
  $("ttFrom").value = "Cairo";

  const today = new Date();

  $("date").min = toLocalISO(today);

  today.setDate(today.getDate() + 1);

  $("date").value = toLocalISO(today);
}

$("swap").addEventListener("click", () => {
  const from = $("from").value;

  $("from").value = $("to").value;
  $("to").value = from;
});

$("searchForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const from = $("from").value;
  const to = $("to").value;
  const date = $("date").value;

  const error = $("searchError");

  error.textContent = "";

  if (from === to) {
    error.textContent =
      "Departure and destination cities must be different.";

    return;
  }

  if (!date) {
    error.textContent = "Choose a travel date.";

    return;
  }

  if (date < $("date").min) {
    error.textContent =
      "That date has passed. Choose today or a later date.";

    return;
  }

  Object.assign(state, {
    from,
    to,
    date
  });

  renderResults();

  showView("viewResults");
});


/* ========================================
   5. Trip Filters and Results
======================================== */

function period(time) {
  const hour = Number(time.slice(0, 2));

  if (hour < 12) {
    return "morning";
  }

  if (hour < 17) {
    return "afternoon";
  }

  if (hour < 21) {
    return "evening";
  }

  return "night";
}

function hasDeparted(trip) {
  return (
    new Date(`${trip.date}T${trip.time}:00`) <
    new Date()
  );
}

function renderResults() {
  $("resultsTitle").textContent =
    `${state.from} → ${state.to} · ${formatDate(state.date)}`;

  state.trips = generateTrips(
    state.from,
    state.to,
    state.date
  );

  $("fType").value = "all";
  $("fPeriod").value = "all";
  $("fSort").value = "time";

  drawResults();
}

function drawResults() {
  const type = $("fType").value;
  const selectedPeriod = $("fPeriod").value;
  const sort = $("fSort").value;

  let trips = state.trips.filter((trip) => {
    const matchesType =
      type === "all" ||
      trip.category === type;

    const matchesPeriod =
      selectedPeriod === "all" ||
      period(trip.time) === selectedPeriod;

    return matchesType && matchesPeriod;
  });

  if (sort === "price") {
    trips = [...trips].sort(
      (a, b) => a.price - b.price
    );
  }

  if (trips.length === 0) {
    $("results").innerHTML = `
      <p class="empty">
        No trips match these filters.
        Try a different bus type or time.
      </p>
    `;

    return;
  }

  $("results").innerHTML = trips.map((trip) => {
    const left = TOTAL_SEATS - trip.taken.size;

    const past = hasDeparted(trip);
    const full = left === 0;
    const unavailable = past || full;

    let label;

    if (past) {
      label = "Departed";
    } else if (full) {
      label = "Sold out";
    } else {
      label =
        `${left}${left === 1 ? " seat left" : " seats left"}`;
    }

    const tripIndex = state.trips.indexOf(trip);

    return `
      <article class="trip ${unavailable ? "full" : ""}">
        <div class="trip-main">

          <div>
            <div class="time">${trip.time}</div>
            <small>${trip.from}</small>
          </div>

          <div class="line">
            ${trip.duration} h
            <br>

            <span class="tag ${trip.category}">
              ${CATEGORIES[trip.category].label}
            </span>
          </div>

          <div>
            <div class="time">
              ${arrivalTime(trip.time, trip.duration)}
            </div>

            <small>${trip.to}</small>
          </div>

          <small class="meta">
            Bus ${trip.bus}
            · ${CATEGORIES[trip.category].perks}
          </small>

        </div>

        <div class="trip-side">
          <div class="price">${egp(trip.price)}</div>

          <div class="left ${left <= 8 ? "low" : ""}">
            ${label}
          </div>

          <button
            class="btn primary"
            data-i="${tripIndex}"
            ${unavailable ? "disabled" : ""}
          >
            Select seats
          </button>
        </div>
      </article>
    `;
  }).join("");
}

["fType", "fPeriod", "fSort"].forEach((id) => {
  $(id).addEventListener("change", drawResults);
});

$("results").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-i]");

  if (!button) {
    return;
  }

  openSeats(state.trips[button.dataset.i]);
});


/* ========================================
   6. Seat Selection
======================================== */

function openSeats(trip) {
  state.trip = trip;
  state.selected = [];
  state.promo = null;

  $("promo").value = "";
  $("promoMsg").textContent = "";
  $("promoMsg").className = "promo-msg";

  $("seatsTitle").textContent =
    `${trip.from} → ${trip.to} · ${trip.time} · ` +
    CATEGORIES[trip.category].label;

  $("sumPrice").textContent = egp(trip.price);

  $("bookError").textContent = "";

  // Boarding and drop-off stations for this trip.
  const stationOptions = (city) =>
    stationsOf(city)
      .map((station) => `<option>${station}</option>`)
      .join("");

  $("pickup").innerHTML = stationOptions(trip.from);
  $("dropoff").innerHTML = stationOptions(trip.to);

  $("bookForm").reset();

  renderSeatMap();
  updateSummary();

  showView("viewSeats");
}

function renderSeatMap() {
  let html = "";

  for (let seat = 1; seat <= TOTAL_SEATS; seat++) {
    const taken = state.trip.taken.has(seat);
    const selected = state.selected.includes(seat);

    html += `
      <button
        type="button"
        class="seat ${taken ? "taken" : ""} ${selected ? "selected" : ""}"
        data-seat="${seat}"
        ${taken ? "disabled" : ""}
        aria-pressed="${selected}"
        aria-label="Seat ${seat}"
      >
        ${seat}
      </button>
    `;

    if (seat % 4 === 2) {
      html += `<span class="aisle"></span>`;
    }
  }

  $("seatMap").innerHTML = html;
}

$("seatMap").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-seat]");

  if (!button) {
    return;
  }

  const seat = Number(button.dataset.seat);
  const index = state.selected.indexOf(seat);

  if (index >= 0) {
    state.selected.splice(index, 1);
  } else if (state.selected.length < 5) {
    state.selected.push(seat);
  } else {
    $("bookError").textContent =
      "You can book up to 5 seats at a time.";

    return;
  }

  $("bookError").textContent = "";

  state.selected.sort((a, b) => a - b);

  renderSeatMap();
  updateSummary();
});


/* ========================================
   7. Pricing and Promo Codes
======================================== */

function calc() {
  const subtotal =
    state.selected.length * state.trip.price;

  const percentage = state.promo
    ? PROMOS[state.promo]
    : 0;

  const discount = Math.round(
    (subtotal * percentage) / 100
  );

  return {
    sub: subtotal,
    pct: percentage,
    disc: discount,
    total: subtotal - discount
  };
}

function updateSummary() {
  const count = state.selected.length;

  const {
    pct,
    disc,
    total
  } = calc();

  $("sumSeats").textContent = count
    ? state.selected.join(", ")
    : "None selected";

  $("discLabel").hidden = !disc;
  $("sumDisc").hidden = !disc;

  $("discLabel").textContent =
    `Discount (${pct}%)`;

  $("sumDisc").textContent =
    `- ${egp(disc)}`;

  $("sumTotal").textContent = egp(total);
}

$("applyPromo").addEventListener("click", () => {
  const code = $("promo").value.trim().toUpperCase();
  const message = $("promoMsg");

  if (!code) {
    message.className = "promo-msg bad";
    message.textContent =
      "Enter a promo code first.";

    return;
  }

  if (PROMOS[code]) {
    state.promo = code;

    message.className = "promo-msg ok";
    message.textContent =
      `Code applied: ${PROMOS[code]}% off`;
  } else {
    state.promo = null;

    message.className = "promo-msg bad";
    message.textContent =
      "This promo code isn't valid.";
  }

  updateSummary();
});


/* ========================================
   8. Booking Confirmation
======================================== */

$("bookForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const name = $("pname").value.trim();
  const phone = $("pphone").value.trim();
  const error = $("bookError");

  if (!state.selected.length) {
    error.textContent = "Select at least one seat.";

    return;
  }

  if (name.length < 3) {
    error.textContent =
      "Enter your full name (at least 3 characters).";

    return;
  }

  if (!/^01[0125]\d{8}$/.test(phone)) {
    error.textContent =
      "Enter an 11-digit mobile number starting with 01.";

    return;
  }

  // Verify that the selected seats are still available.
  const nowTaken = takenSeats(state.trip);

  if (state.selected.some((seat) => nowTaken.has(seat))) {
    error.textContent =
      "Someone just booked one of these seats. " +
      "Please choose different ones.";

    state.trip.taken = nowTaken;

    state.selected = state.selected.filter(
      (seat) => !nowTaken.has(seat)
    );

    renderSeatMap();
    updateSummary();

    return;
  }

  const {
    sub,
    disc,
    total
  } = calc();

  const booking = {
    code:
      "BUS" +
      Math.random().toString(36).slice(2, 8).toUpperCase(),

    tripId: state.trip.id,

    from: state.trip.from,
    to: state.trip.to,
    date: state.trip.date,
    time: state.trip.time,

    category: state.trip.category,
    seats: [...state.selected],

    subtotal: sub,
    discount: disc,
    promo: state.promo,
    total,

    payment: $("pay").value,

    bus: state.trip.bus,
    station: `${state.trip.from} – ${$("pickup").value}`,
    dropoff: `${state.trip.to} – ${$("dropoff").value}`,

    name,
    phone,
    status: "active"
  };

  const bookings = loadBookings();

  bookings.push(booking);

  saveBookings(bookings);
  updateBadge();

  $("ticketBox").innerHTML = ticketHTML(booking);

  showView("viewTicket");
});


/* ========================================
   9. Ticket Generation
======================================== */

function ticketHTML(booking) {
  const cancelled = booking.status === "cancelled";

  return `
    <div class="ticket">

      <div class="ticket-body">
        <p class="route">
          ${booking.from} → ${booking.to}
        </p>

        <dl>
          <dt>Date</dt>
          <dd>${formatDate(booking.date)}</dd>

          <dt>Departure</dt>
          <dd>
            ${booking.time}
            (${catLabel(booking)})
          </dd>

          <dt>Boarding</dt>
          <dd>
            ${escapeHTML(booking.station || "Main Station")}
            · from ${boardingTime(booking.time)}
          </dd>

          ${
            booking.dropoff
              ? `
                <dt>Drop-off</dt>
                <dd>${escapeHTML(booking.dropoff)}</dd>
              `
              : ""
          }

          ${
            booking.bus
              ? `
                <dt>Bus no.</dt>
                <dd>${escapeHTML(booking.bus)}</dd>
              `
              : ""
          }

          <dt>Seats</dt>
          <dd>${booking.seats.join(", ")}</dd>

          <dt>Passenger</dt>
          <dd>
            ${escapeHTML(booking.name)}
            · ${escapeHTML(booking.phone)}
          </dd>

          ${
            booking.payment
              ? `
                <dt>Payment</dt>
                <dd>${PAY[booking.payment] || "Not specified"}</dd>
              `
              : ""
          }

          ${
            booking.discount
              ? `
                <dt>Discount</dt>
                <dd>
                  ${egp(booking.discount)}
                  (${escapeHTML(booking.promo || "")})
                </dd>
              `
              : ""
          }

          <dt>Total</dt>
          <dd>${egp(booking.total)}</dd>
        </dl>
      </div>

      <div class="stub ${cancelled ? "cancelled" : ""}">
        <small>
          ${cancelled ? "Cancelled" : "Booking code"}
        </small>

        <div class="code">
          ${escapeHTML(booking.code)}
        </div>

        ${
          cancelled
            ? `
              <span class="refund">
                Refunded: ${egp(booking.refund || 0)}
              </span>
            `
            : ""
        }
      </div>

    </div>
  `;
}


/* ========================================
   10. My Bookings
======================================== */

function renderBookings() {
  const bookings = loadBookings().reverse();
  const box = $("bookingsList");

  if (bookings.length === 0) {
    box.innerHTML = `
      <p class="empty">
        You have no bookings yet.
        Start by booking your first trip.
      </p>
    `;

    return;
  }

  box.innerHTML = bookings.map((booking) => `
    <div>
      ${ticketHTML(booking)}

      ${
        booking.status === "active"
          ? `
            <button
              class="btn danger"
              data-cancel="${escapeHTML(booking.code)}"
            >
              Cancel booking
            </button>
          `
          : ""
      }
    </div>
  `).join("");
}

function refundInfo(booking) {
  const departure = new Date(
    `${booking.date}T${booking.time}:00`
  );

  const hours = (departure - Date.now()) / 36e5;

  let percentage = 0;

  if (hours >= 24) {
    percentage = 100;
  } else if (hours >= 3) {
    percentage = 50;
  }

  return {
    pct: percentage,
    amount: Math.round(
      (booking.total * percentage) / 100
    )
  };
}

$("bookingsList").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-cancel]");

  if (!button) {
    return;
  }

  const bookings = loadBookings();

  const booking = bookings.find(
    (item) => item.code === button.dataset.cancel
  );

  if (!booking || booking.status !== "active") {
    return;
  }

  const {
    pct,
    amount
  } = refundInfo(booking);

  const message = pct
    ? `You will be refunded ${pct}% of the total ` +
      `(${egp(amount)}). Cancel this booking?`
    : "The trip departs in less than 3 hours, " +
      "so there is no refund. Cancel this booking?";

  if (!confirm(message)) {
    return;
  }

  booking.status = "cancelled";
  booking.refund = amount;

  saveBookings(bookings);

  updateBadge();
  renderBookings();
});


/* ========================================
   11. Booking Lookup
======================================== */

$("lookupForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const code = $("lkCode").value.trim().toUpperCase();
  const phone = $("lkPhone").value.trim();

  const booking = loadBookings().find(
    (item) =>
      item.code === code &&
      item.phone === phone
  );

  $("lookupResult").innerHTML = booking
    ? ticketHTML(booking)
    : `
      <p class="error">
        No booking matches this code and mobile number.
        Check the details and try again.
      </p>
    `;
});


/* ========================================
   12. Booking Counter
======================================== */

function updateBadge() {
  const count = loadBookings().filter(
    (booking) => booking.status === "active"
  ).length;

  $("count").textContent = count;
  $("count").hidden = count === 0;
}


/* ========================================
   13. Navigation
======================================== */

document.querySelectorAll("[data-back]").forEach((button) => {
  button.addEventListener("click", () => {
    showView(button.dataset.back);
  });
});

$("navSearch").addEventListener("click", () => {
  showView("viewSearch");
});

$("navTimetable").addEventListener("click", () => {
  showView("viewTimetable");
});

$("navBookings").addEventListener("click", () => {
  showView("viewBookings");
});

$("brand").addEventListener("click", (event) => {
  event.preventDefault();

  showView("viewSearch");
});

$("newBtn").addEventListener("click", () => {
  showView("viewSearch");
});

$("printBtn").addEventListener("click", () => {
  window.print();
});


/* ========================================
   14. Popular Routes
======================================== */

const POPULAR = [
  ["Cairo", "Alexandria"],
  ["Cairo", "Assiut"],
  ["Cairo", "Luxor"],
  ["Cairo", "Sharm El-Sheikh"],
  ["Cairo", "Hurghada"],
  ["Banha", "Cairo"],
  ["Alexandria", "Cairo"],
  ["Tanta", "Cairo"]
];

function renderPopular() {
  $("statCities").textContent = CITIES.length;

  $("popular").innerHTML = POPULAR.map(([from, to], index) => `
    <button class="route-card" data-i="${index}">
      <span>
        <b>${from} → ${to}</b>
        <small>Daily trips</small>
      </span>

      <span class="from-price">
        from ${egp(basePrice(from, to))}
      </span>
    </button>
  `).join("");
}

$("popular").addEventListener("click", (event) => {
  const card = event.target.closest("button[data-i]");

  if (!card) {
    return;
  }

  const [from, to] = POPULAR[card.dataset.i];

  $("from").value = from;
  $("to").value = to;

  $("searchForm").requestSubmit();
});


/* ========================================
   15. Timetable and Fares
======================================== */

function renderTimetable() {
  const from = $("ttFrom").value;

  $("ttTimes").innerHTML =
    "Daily departures: " +
    TIMES.map((time, index) =>
      `<b>${time}</b> (${CATEGORIES[CATEGORY_BY_SLOT[index]].label})`
    ).join(" · ");

  $("ttBody").innerHTML = CITIES
    .filter((to) => to !== from)
    .map((to) => {
      const base = basePrice(from, to);

      const fare = (key) =>
        egp(Math.round(base * CATEGORIES[key].mult));

      return `
        <tr>
          <td>${to}</td>
          <td>${routeHours(from, to)} h</td>
          <td>${fare("standard")}</td>
          <td>${fare("deluxe")}</td>
          <td>${fare("vip")}</td>
          <td>
            <button class="btn" data-tt="${to}">Book</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

$("ttFrom").addEventListener("change", renderTimetable);

$("ttBody").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-tt]");

  if (!button) {
    return;
  }

  $("from").value = $("ttFrom").value;
  $("to").value = button.dataset.tt;

  $("searchForm").requestSubmit();
});


/* ========================================
   16. Application Initialization
======================================== */

fillCities();
renderPopular();
updateBadge();