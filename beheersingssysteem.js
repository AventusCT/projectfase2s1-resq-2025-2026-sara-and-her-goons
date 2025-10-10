    // Door Jhorano
    document.addEventListener("DOMContentLoaded", () => {
      const table = document.querySelector("tbody");

      const savedRoles = JSON.parse(localStorage.getItem("roles")) || {};

      for (let row of table.querySelectorAll("tr")) {
        const email = row.dataset.email;
        const roleSpan = row.querySelector(".role");
        const button = row.querySelector("button");

        if (savedRoles[email]) {
          roleSpan.textContent = savedRoles[email];
          roleSpan.className = "role " + savedRoles[email].toLowerCase();

          if (savedRoles[email] === "Admin") {
            button.textContent = "Verwijder Admin";
            button.className = "remove-admin";
          } else {
            button.textContent = "Maak Admin";
            button.className = "make-admin";
          }
        }
      }

      table.addEventListener("click", (e) => {
        if (e.target.tagName === "BUTTON") {
          const row = e.target.closest("tr");
          const email = row.dataset.email;
          const roleSpan = row.querySelector(".role");

          if (e.target.classList.contains("make-admin")) {
            roleSpan.textContent = "Admin";
            roleSpan.className = "role admin";
            e.target.textContent = "Verwijder Admin";
            e.target.className = "remove-admin";

            savedRoles[email] = "Admin";
          } else if (e.target.classList.contains("remove-admin")) {
            roleSpan.textContent = "Gebruiker";
            roleSpan.className = "role user";
            e.target.textContent = "Maak Admin";
            e.target.className = "make-admin";

            savedRoles[email] = "Gebruiker";
          }

          localStorage.setItem("roles", JSON.stringify(savedRoles));
        }
      });
    });