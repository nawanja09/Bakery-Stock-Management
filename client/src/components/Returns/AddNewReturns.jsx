import React from 'react'

const AddNewReturns = () => {
  return (
    <div>
      <h2>Add New Returns</h2>
      {/* Add your form or components for adding new returns here */}
      <form>
        <div>
          <label htmlFor="item">Item:</label>
          <input type="text" id="item" name="item" required />
        </div>
        <div>
          <label htmlFor="quantity">Quantity:</label>
          <input type="number" id="quantity" name="quantity" required />
        </div>
        <div>
          <label htmlFor="reason">Reason:</label>
          <textarea id="reason" name="reason" required></textarea>
        </div>
        <button type="submit">Add Return</button>
      </form>
    </div>
  )
}

export default AddNewReturns
