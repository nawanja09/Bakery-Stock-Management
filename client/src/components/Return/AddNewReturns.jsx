import React from 'react'

const AddNewReturns = () => {
  return (
    <div>
      <h2>Add New Returns</h2>
      <form>
        <div>
          <label>Item:</label>
          <input type="text" name="item" required />
        </div>
        <div>
          <label>Quantity:</label>
          <input type="number" name="quantity" required />
        </div>
        <div>
          <label>Reason:</label>
          <textarea name="reason" required></textarea>
        </div>
        <button type="submit">Submit</button>
      </form>
    </div>
  )
}

export default AddNewReturns
