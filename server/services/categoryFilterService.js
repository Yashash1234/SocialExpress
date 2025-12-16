const {
  getCategoriesFromTextRazor,
  getCategoriesFromInterfaceAPI,
  
} = require("./apiServices");

class CategoryFilterService {
  async getCategories(content, timeout) {
    throw new Error("Not implemented");
  }
}

class TextRazorService extends CategoryFilterService {
  async getCategories(content, timeout) {
    return await getCategoriesFromTextRazor(content, timeout);
  }
}

class InterfaceAPIService extends CategoryFilterService {
  async getCategories(content, timeout) {
    return await getCategoriesFromInterfaceAPI(content, timeout);
  }
}



function createCategoryFilterService(servicePreference) {
  switch (servicePreference) {
    case "TextRazor":
      return new TextRazorService();
    case "InterfaceAPI":
      return new InterfaceAPIService();
 
    default:
      throw new Error("Invalid service preference");
  }
}

module.exports = createCategoryFilterService;
