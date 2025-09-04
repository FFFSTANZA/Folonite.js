// Basic script to show an alert when a button is clicked
document.addEventListener('DOMContentLoaded', function() {
    const button = document.querySelector('button');
    button.addEventListener('click', function() {
      alert('Button was clicked!');
    });
  });
  