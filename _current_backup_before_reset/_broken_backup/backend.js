
import { db, collection, addDoc } from "./firebase.js";

// Form Submission Handler
export async function submitContactForm(event) {
    event.preventDefault();

    const form = event.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerText;

    submitBtn.innerText = "Sending...";
    submitBtn.disabled = true;

    // Harvest Data
    const formData = new FormData(form);
    const data = {};
    formData.forEach((value, key) => data[key] = value);

    // Add Timestamp
    data.timestamp = new Date().toISOString();

    try {
        if (db) {
            await addDoc(collection(db, "contacts"), data);
            alert("Message sent securely! We will be in touch.");
        } else {
            // Fallback for simulation/no-keys
            console.log("Simulated Backend Submission:", data);
            await new Promise(r => setTimeout(r, 1000));
            alert("Message sent! (Simulation Mode)");
        }

        form.reset();
        closeContactModal(); // Assumes global function from script.js

    } catch (e) {
        console.error("Error sending message: ", e);
        alert("Error sending message. Please email us directly.");
    } finally {
        submitBtn.innerText = originalText;
        submitBtn.disabled = false;
    }
}

// Global Attach (to allow onclick="startBackend()")
window.submitContactForm = submitContactForm;
