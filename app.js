fetch("data.json")
  .then(res => res.json())
  .then(data => {
    console.log("Loaded data:", data);

    const output = document.getElementById("output");

    const sqft = 1000;
    const price = sqft * data.rates.handyman_per_sqft;

    output.innerHTML = `
      <h2>${data.company.name}</h2>
      <p>Sample Quote for ${sqft} sq ft</p>
      <strong>$${price.toLocaleString()}</strong>
    `;
  })
  .catch(err => {
    console.error("Error loading data:", err);
  });
