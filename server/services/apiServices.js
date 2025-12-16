const axios = require("axios");

const getCategoriesFromTextRazor = async (content, timeout) => {
  const API_KEY = process.env.TEXTRAZOR_API_KEY;
  const API_URL = process.env.TEXTRAZOR_API_URL;

  if (!API_KEY || !API_URL) {
    throw new Error("TextRazor API key or URL not set");
  }

  const categories = {};

  const source = axios.CancelToken.source();
  const timeoutId = setTimeout(() => {
    source.cancel("TextRazor request timed out");
  }, timeout);

  try {
    const response = await axios.post(
      API_URL,
      {
        text: content,
        classifiers: "community",
        cleanup: {
          mode: "stripTags",
        },
      },
      {
        headers: {
          "X-TextRazor-Key": API_KEY,
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept-Encoding": "gzip",
        },
        cancelToken: source.token,
      }
    );

    if (response.data.response.categories) {
      response.data.response.categories.forEach(({ label, score }) => {
        categories[label] = score;
      });
    }

    return categories;
  } catch (error) {
    if (axios.isCancel(error)) {
      console.log("TextRazor request cancelled");
      return categories;
    } else {
      const { status, statusText } = error.response;
      throw new Error(`Error ${status}: ${statusText}`);
    }
  } finally {
    clearTimeout(timeoutId);
  }
};


const getCategoriesFromInterfaceAPI = async (content, timeout) => {
  const API_URL = process.env.INTERFACE_API_URL;
  const API_KEY = process.env.INTERFACE_API_KEY;

  const scoreThreshold = 0.2;

  if (!API_KEY || !API_URL) {
    throw new Error("Interface API key or URL not set");
  }

  const CANDIDATE_LABELS = [
    "Programming",
    "Health and Fitness",
    "Travel",
    "Food and Cooking",
    "Music",
    "Sports",
    "Fashion",
    "Art and Design",
    "Business and Entrepreneurship",
    "Education",
  ];

  const categories = {};

  const source = axios.CancelToken.source();
  const timeoutId = setTimeout(() => {
    source.cancel("Request timed out");
  }, timeout);

  try {
    const response = await axios.post(
      API_URL,
      {
        inputs: content,
        parameters: { candidate_labels: CANDIDATE_LABELS },
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        cancelToken: source.token,
      }
    );

    const { labels, scores } = response.data;

    labels.forEach((label, index) => {
      const score = scores[index];
      if (score >= scoreThreshold) {
        categories[label] = score;
      }
    });

    return categories;
  } catch (error) {
    if (axios.isCancel(error)) {
      console.log("Interface API request cancelled");
      return categories;
    } else {
      const { status, statusText } = error.response;
      throw new Error(`Error ${status}: ${statusText}`);
    }
  } finally {
    clearTimeout(timeoutId);
  }
};

module.exports = {
  getCategoriesFromTextRazor,
  getCategoriesFromInterfaceAPI,
};
