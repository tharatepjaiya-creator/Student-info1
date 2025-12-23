// Utility to handle form submissions
async function handleFormSubmit(event, url, redirectUrl) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const data = Object.fromEntries(formData.entries());
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            if (redirectUrl) {
                window.location.href = redirectUrl;
            } else if (result.redirect) {
                window.location.href = result.redirect;
            } else {
                alert(result.message || 'Success');
            }
        } else {
            alert(result.error || 'Operation failed');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred');
    }
}

// Check auth status (Simple check if needed, mostly handled by backend redirects)
async function checkAuth() {
    // Implementation depends on specific page needs
}
