fetch("data.json")
  .then(res => res.json())
  .then(data => {
    document.getElementById("calculate").addEventListener("click", () => {
      const sqft = Number(document.getElementById("sqft").value);
      const service = document.getElementById("service").value;

      if (!sqft || sqft <= 0) {
        alert("Enter a valid square footage");
        return;
      }

      const rate = service === "contractor"
        ? data.rates.contractor_per_sqft
        : data.rates.handyman_per_sqft;

      const total = sqft * rate;

      document.getElementById("output").innerHTML = `
        <h2>${data.company.name}</h2>
        <p>${sqft} sq ft @ $${rate}/sq ft</p>
        <strong>Total: $${total.toLocaleString()}</strong>
      `;
    });
  })
  .catch(err => console.error("Error loading data.json:", err));
